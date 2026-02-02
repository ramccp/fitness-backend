import express from 'express';
import Meal from '../models/Meal.js';
import Plan from '../models/Plan.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Meal type labels for display
const MEAL_TYPE_LABELS = {
  upon_wakeup: 'Upon Wakeup',
  pre_workout: 'Pre-Workout',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
  other: 'Other'
};

// @route   POST /api/meals
// @desc    Add meal
// @access  Private
router.post('/', async (req, res, next) => {
  try {
    const { mealType, items, notes, date, week } = req.body;

    if (!mealType || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Meal type and at least one item are required'
      });
    }

    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    const entryWeek = week || (plan ? plan.calculateCurrentWeek() : 1);

    const meal = await Meal.create({
      userId: req.user._id,
      planId: plan?._id,
      mealType,
      items,
      notes,
      date: date ? new Date(date) : new Date(),
      week: entryWeek
    });

    res.status(201).json({
      success: true,
      data: meal
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/meals
// @desc    Get all meals
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, startDate, endDate, week, mealType } = req.query;

    const query = { userId: req.user._id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (week) {
      query.week = parseInt(week);
    }

    if (mealType) {
      query.mealType = mealType;
    }

    const meals = await Meal.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Meal.countDocuments(query);

    res.json({
      success: true,
      data: {
        meals,
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

// @route   GET /api/meals/date/:date
// @desc    Get meals for a specific date
// @access  Private
router.get('/date/:date', async (req, res, next) => {
  try {
    const date = new Date(req.params.date);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const meals = await Meal.find({
      userId: req.user._id,
      date: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: 1 });

    // Group by meal type
    const mealsByType = {};
    meals.forEach(meal => {
      if (!mealsByType[meal.mealType]) {
        mealsByType[meal.mealType] = [];
      }
      mealsByType[meal.mealType].push(meal);
    });

    // Calculate daily totals
    const dailyTotals = meals.reduce((totals, meal) => {
      meal.items.forEach(item => {
        totals.calories += item.calories || 0;
        totals.protein += item.protein || 0;
        totals.carbs += item.carbs || 0;
        totals.fats += item.fats || 0;
      });
      return totals;
    }, { calories: 0, protein: 0, carbs: 0, fats: 0 });

    res.json({
      success: true,
      data: {
        meals,
        mealsByType,
        dailyTotals,
        mealTypeLabels: MEAL_TYPE_LABELS
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/meals/summary
// @desc    Get daily/weekly meal summary
// @access  Private
router.get('/summary', async (req, res, next) => {
  try {
    const { type = 'daily', startDate, endDate } = req.query;

    const matchQuery = { userId: req.user._id };
    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) matchQuery.date.$gte = new Date(startDate);
      if (endDate) matchQuery.date.$lte = new Date(endDate);
    }

    if (type === 'weekly') {
      const summary = await Meal.aggregate([
        { $match: matchQuery },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$week',
            totalCalories: { $sum: '$items.calories' },
            totalProtein: { $sum: '$items.protein' },
            totalCarbs: { $sum: '$items.carbs' },
            totalFats: { $sum: '$items.fats' },
            mealCount: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      return res.json({
        success: true,
        data: summary.map(week => ({
          week: week._id,
          totalCalories: Math.round(week.totalCalories),
          totalProtein: Math.round(week.totalProtein),
          totalCarbs: Math.round(week.totalCarbs),
          totalFats: Math.round(week.totalFats),
          mealCount: week.mealCount,
          avgDailyCalories: Math.round(week.totalCalories / 7)
        }))
      });
    }

    // Daily summary
    const summary = await Meal.aggregate([
      { $match: matchQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalCalories: { $sum: '$items.calories' },
          totalProtein: { $sum: '$items.protein' },
          totalCarbs: { $sum: '$items.carbs' },
          totalFats: { $sum: '$items.fats' },
          mealCount: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

    res.json({
      success: true,
      data: summary.map(day => ({
        date: day._id,
        totalCalories: Math.round(day.totalCalories),
        totalProtein: Math.round(day.totalProtein),
        totalCarbs: Math.round(day.totalCarbs),
        totalFats: Math.round(day.totalFats),
        mealCount: day.mealCount
      }))
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/meals/today
// @desc    Get today's meals
// @access  Private
router.get('/today', async (req, res, next) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const meals = await Meal.find({
      userId: req.user._id,
      date: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: 1 });

    // Calculate totals
    const totals = meals.reduce((acc, meal) => {
      meal.items.forEach(item => {
        acc.calories += item.calories || 0;
        acc.protein += item.protein || 0;
        acc.carbs += item.carbs || 0;
        acc.fats += item.fats || 0;
      });
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fats: 0 });

    res.json({
      success: true,
      data: {
        meals,
        totals,
        mealTypeLabels: MEAL_TYPE_LABELS
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/meals/:id
// @desc    Get single meal
// @access  Private
router.get('/:id', async (req, res, next) => {
  try {
    const meal = await Meal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: 'Meal not found'
      });
    }

    res.json({
      success: true,
      data: meal
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/meals/:id
// @desc    Update meal
// @access  Private
router.put('/:id', async (req, res, next) => {
  try {
    const { mealType, items, notes, date, week } = req.body;

    const updateFields = {};
    if (mealType !== undefined) updateFields.mealType = mealType;
    if (items !== undefined) updateFields.items = items;
    if (notes !== undefined) updateFields.notes = notes;
    if (date !== undefined) updateFields.date = new Date(date);
    if (week !== undefined) updateFields.week = week;

    const meal = await Meal.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: 'Meal not found'
      });
    }

    res.json({
      success: true,
      data: meal
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/meals/:id/item
// @desc    Add item to meal
// @access  Private
router.post('/:id/item', async (req, res, next) => {
  try {
    const { name, quantity, calories, protein, carbs, fats } = req.body;

    const meal = await Meal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: 'Meal not found'
      });
    }

    meal.items.push({ name, quantity, calories, protein, carbs, fats });
    await meal.save();

    res.json({
      success: true,
      data: meal
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/meals/:id/item/:itemId
// @desc    Remove item from meal
// @access  Private
router.delete('/:id/item/:itemId', async (req, res, next) => {
  try {
    const meal = await Meal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: 'Meal not found'
      });
    }

    meal.items = meal.items.filter(item => item._id.toString() !== req.params.itemId);
    await meal.save();

    res.json({
      success: true,
      data: meal
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/meals/:id
// @desc    Delete meal
// @access  Private
router.delete('/:id', async (req, res, next) => {
  try {
    const meal = await Meal.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        message: 'Meal not found'
      });
    }

    res.json({
      success: true,
      message: 'Meal deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
