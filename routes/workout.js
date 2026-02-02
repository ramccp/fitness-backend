import express from 'express';
import Workout from '../models/Workout.js';
import Plan from '../models/Plan.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   POST /api/workout
// @desc    Add workout
// @access  Private
router.post('/', async (req, res, next) => {
  try {
    const { name, exercises, duration, caloriesBurned, notes, date, week } = req.body;

    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    const entryWeek = week || (plan ? plan.calculateCurrentWeek() : 1);

    const workout = await Workout.create({
      userId: req.user._id,
      planId: plan?._id,
      name: name || 'Workout',
      exercises: exercises || [],
      duration,
      caloriesBurned,
      notes,
      date: date ? new Date(date) : new Date(),
      week: entryWeek
    });

    res.status(201).json({
      success: true,
      data: workout
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/workout
// @desc    Get all workouts
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, week } = req.query;

    const query = { userId: req.user._id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (week) {
      query.week = parseInt(week);
    }

    const workouts = await Workout.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Workout.countDocuments(query);

    res.json({
      success: true,
      data: {
        workouts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/workout/date/:date
// @desc    Get workouts by date
// @access  Private
router.get('/date/:date', async (req, res, next) => {
  try {
    const date = new Date(req.params.date);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const workouts = await Workout.find({
      userId: req.user._id,
      date: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: workouts
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/workout/weekly
// @desc    Get weekly workout summary
// @access  Private
router.get('/weekly', async (req, res, next) => {
  try {
    const summary = await Workout.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$week',
          totalWorkouts: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          totalCaloriesBurned: { $sum: '$caloriesBurned' },
          totalExercises: { $sum: { $size: '$exercises' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: summary.map(week => ({
        week: week._id,
        totalWorkouts: week.totalWorkouts,
        totalDuration: week.totalDuration || 0,
        totalCaloriesBurned: week.totalCaloriesBurned || 0,
        totalExercises: week.totalExercises
      }))
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/workout/:id
// @desc    Get single workout
// @access  Private
router.get('/:id', async (req, res, next) => {
  try {
    const workout = await Workout.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    res.json({
      success: true,
      data: workout
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/workout/:id
// @desc    Update workout
// @access  Private
router.put('/:id', async (req, res, next) => {
  try {
    const { name, exercises, duration, caloriesBurned, notes, date, week, completed } = req.body;

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (exercises !== undefined) updateFields.exercises = exercises;
    if (duration !== undefined) updateFields.duration = duration;
    if (caloriesBurned !== undefined) updateFields.caloriesBurned = caloriesBurned;
    if (notes !== undefined) updateFields.notes = notes;
    if (date !== undefined) updateFields.date = new Date(date);
    if (week !== undefined) updateFields.week = week;
    if (completed !== undefined) updateFields.completed = completed;

    const workout = await Workout.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    res.json({
      success: true,
      data: workout
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/workout/:id/exercise
// @desc    Add exercise to workout
// @access  Private
router.post('/:id/exercise', async (req, res, next) => {
  try {
    const { name, sets, reps, weight, unit, notes } = req.body;

    const workout = await Workout.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    workout.exercises.push({ name, sets, reps, weight, unit, notes });
    await workout.save();

    res.json({
      success: true,
      data: workout
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/workout/:id/exercise/:exerciseId
// @desc    Remove exercise from workout
// @access  Private
router.delete('/:id/exercise/:exerciseId', async (req, res, next) => {
  try {
    const workout = await Workout.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    workout.exercises = workout.exercises.filter(
      ex => ex._id.toString() !== req.params.exerciseId
    );
    await workout.save();

    res.json({
      success: true,
      data: workout
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/workout/:id
// @desc    Delete workout
// @access  Private
router.delete('/:id', async (req, res, next) => {
  try {
    const workout = await Workout.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    res.json({
      success: true,
      message: 'Workout deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
