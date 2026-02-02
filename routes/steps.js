import express from 'express';
import Steps from '../models/Steps.js';
import Plan from '../models/Plan.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   POST /api/steps
// @desc    Add or update steps entry for a date
// @access  Private
router.post('/', async (req, res, next) => {
  try {
    const { count, goal, distance, caloriesBurned, date, week } = req.body;

    const entryDate = date ? new Date(date) : new Date();
    // Normalize date to start of day
    entryDate.setHours(0, 0, 0, 0);

    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    const entryWeek = week || (plan ? plan.calculateCurrentWeek() : 1);
    const stepsGoal = goal || plan?.goals?.dailyStepsGoal || 10000;

    // Check if entry exists for this date
    let stepsEntry = await Steps.findOne({
      userId: req.user._id,
      date: entryDate
    });

    if (stepsEntry) {
      // Update existing entry
      stepsEntry.count = count;
      stepsEntry.goal = stepsGoal;
      if (distance !== undefined) stepsEntry.distance = distance;
      if (caloriesBurned !== undefined) stepsEntry.caloriesBurned = caloriesBurned;
      await stepsEntry.save();
    } else {
      // Create new entry
      stepsEntry = await Steps.create({
        userId: req.user._id,
        planId: plan?._id,
        date: entryDate,
        week: entryWeek,
        count,
        goal: stepsGoal,
        distance,
        caloriesBurned
      });
    }

    res.status(201).json({
      success: true,
      data: stepsEntry
    });
  } catch (error) {
    // Handle duplicate key error gracefully
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Entry for this date already exists. Use PUT to update.'
      });
    }
    next(error);
  }
});

// @route   GET /api/steps
// @desc    Get all steps entries
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 30, startDate, endDate, week } = req.query;

    const query = { userId: req.user._id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (week) {
      query.week = parseInt(week);
    }

    const steps = await Steps.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Steps.countDocuments(query);

    res.json({
      success: true,
      data: {
        steps,
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

// @route   GET /api/steps/date/:date
// @desc    Get steps for a specific date
// @access  Private
router.get('/date/:date', async (req, res, next) => {
  try {
    const date = new Date(req.params.date);
    date.setHours(0, 0, 0, 0);

    const steps = await Steps.findOne({
      userId: req.user._id,
      date
    });

    if (!steps) {
      return res.json({
        success: true,
        data: null
      });
    }

    res.json({
      success: true,
      data: steps
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/steps/weekly
// @desc    Get weekly steps summary
// @access  Private
router.get('/weekly', async (req, res, next) => {
  try {
    const summary = await Steps.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$week',
          totalSteps: { $sum: '$count' },
          avgSteps: { $avg: '$count' },
          maxSteps: { $max: '$count' },
          minSteps: { $min: '$count' },
          daysTracked: { $sum: 1 },
          avgGoalPercentage: { $avg: { $multiply: [{ $divide: ['$count', '$goal'] }, 100] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: summary.map(week => ({
        week: week._id,
        totalSteps: week.totalSteps,
        avgSteps: Math.round(week.avgSteps),
        maxSteps: week.maxSteps,
        minSteps: week.minSteps,
        daysTracked: week.daysTracked,
        avgGoalPercentage: Math.round(week.avgGoalPercentage)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/steps/today
// @desc    Get today's steps
// @access  Private
router.get('/today', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const steps = await Steps.findOne({
      userId: req.user._id,
      date: today
    });

    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    res.json({
      success: true,
      data: steps || {
        count: 0,
        goal: plan?.goals?.dailyStepsGoal || 10000,
        date: today
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/steps/:id
// @desc    Update steps entry
// @access  Private
router.put('/:id', async (req, res, next) => {
  try {
    const { count, goal, distance, caloriesBurned, week } = req.body;

    const updateFields = {};
    if (count !== undefined) updateFields.count = count;
    if (goal !== undefined) updateFields.goal = goal;
    if (distance !== undefined) updateFields.distance = distance;
    if (caloriesBurned !== undefined) updateFields.caloriesBurned = caloriesBurned;
    if (week !== undefined) updateFields.week = week;

    const steps = await Steps.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!steps) {
      return res.status(404).json({
        success: false,
        message: 'Steps entry not found'
      });
    }

    res.json({
      success: true,
      data: steps
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/steps/:id
// @desc    Delete steps entry
// @access  Private
router.delete('/:id', async (req, res, next) => {
  try {
    const steps = await Steps.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!steps) {
      return res.status(404).json({
        success: false,
        message: 'Steps entry not found'
      });
    }

    res.json({
      success: true,
      message: 'Steps entry deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
