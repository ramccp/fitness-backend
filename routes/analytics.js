import express from 'express';
import Weight from '../models/Weight.js';
import Workout from '../models/Workout.js';
import Steps from '../models/Steps.js';
import Meal from '../models/Meal.js';
import Plan from '../models/Plan.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/analytics/overview
// @desc    Get dashboard overview stats
// @access  Private
router.get('/overview', async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get current plan
    const plan = await Plan.findOne({
      userId,
      status: { $in: ['active', 'paused'] }
    });

    // Get latest weight
    const latestWeight = await Weight.findOne({ userId }).sort({ date: -1 });
    const firstWeight = await Weight.findOne({ userId }).sort({ date: 1 });

    // Today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // This week's date range
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get today's stats
    const todaySteps = await Steps.findOne({ userId, date: { $gte: today, $lt: tomorrow } });
    const todayWorkouts = await Workout.countDocuments({ userId, date: { $gte: today, $lt: tomorrow } });
    const todayMeals = await Meal.find({ userId, date: { $gte: today, $lt: tomorrow } });

    // Calculate today's calories
    let todayCalories = 0;
    todayMeals.forEach(meal => {
      meal.items.forEach(item => {
        todayCalories += item.calories || 0;
      });
    });

    // Get weekly stats
    const weeklyWorkouts = await Workout.countDocuments({ userId, date: { $gte: weekStart, $lt: weekEnd } });
    const weeklySteps = await Steps.aggregate([
      { $match: { userId, date: { $gte: weekStart, $lt: weekEnd } } },
      { $group: { _id: null, total: { $sum: '$count' }, avg: { $avg: '$count' } } }
    ]);

    // Get streak (consecutive days with activity)
    const recentActivity = await Steps.find({ userId })
      .sort({ date: -1 })
      .limit(30)
      .select('date count');

    let streak = 0;
    const checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    for (const entry of recentActivity) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      if (entryDate.getTime() === checkDate.getTime() && entry.count > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (entryDate.getTime() < checkDate.getTime()) {
        break;
      }
    }

    res.json({
      success: true,
      data: {
        plan: plan ? {
          status: plan.status,
          currentWeek: plan.calculateCurrentWeek(),
          totalWeeks: plan.numberOfWeeks,
          progressPercentage: Math.round((plan.calculateCurrentWeek() / plan.numberOfWeeks) * 100)
        } : null,
        weight: {
          current: latestWeight?.weight || null,
          initial: firstWeight?.weight || null,
          change: latestWeight && firstWeight ?
            Math.round((latestWeight.weight - firstWeight.weight) * 10) / 10 : null,
          unit: latestWeight?.unit || 'kg'
        },
        today: {
          steps: todaySteps?.count || 0,
          stepsGoal: todaySteps?.goal || plan?.goals?.dailyStepsGoal || 10000,
          workouts: todayWorkouts,
          calories: todayCalories,
          mealsLogged: todayMeals.length
        },
        weekly: {
          workouts: weeklyWorkouts,
          workoutGoal: plan?.goals?.weeklyWorkoutGoal || 4,
          totalSteps: weeklySteps[0]?.total || 0,
          avgSteps: Math.round(weeklySteps[0]?.avg || 0)
        },
        streak
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/weight
// @desc    Get weight analytics
// @access  Private
router.get('/weight', async (req, res, next) => {
  try {
    const { period = 'all' } = req.query;
    const userId = req.user._id;

    let dateFilter = {};
    const now = new Date();

    if (period === 'month') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
    } else if (period === '3months') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 3)) };
    } else if (period === '6months') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 6)) };
    }

    const matchQuery = { userId };
    if (Object.keys(dateFilter).length > 0) {
      matchQuery.date = dateFilter;
    }

    // Get all weight entries
    const weights = await Weight.find(matchQuery).sort({ date: 1 });

    // Weekly averages
    const weeklyAvg = await Weight.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$week',
          avgWeight: { $avg: '$weight' },
          minWeight: { $min: '$weight' },
          maxWeight: { $max: '$weight' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Monthly averages
    const monthlyAvg = await Weight.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          avgWeight: { $avg: '$weight' },
          minWeight: { $min: '$weight' },
          maxWeight: { $max: '$weight' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate trends
    const firstWeight = weights[0]?.weight || 0;
    const lastWeight = weights[weights.length - 1]?.weight || 0;
    const totalChange = lastWeight - firstWeight;

    res.json({
      success: true,
      data: {
        entries: weights,
        weeklyAverage: weeklyAvg.map(w => ({
          week: w._id,
          avg: Math.round(w.avgWeight * 10) / 10,
          min: w.minWeight,
          max: w.maxWeight,
          entries: w.count
        })),
        monthlyAverage: monthlyAvg.map(m => ({
          month: m._id,
          avg: Math.round(m.avgWeight * 10) / 10,
          min: m.minWeight,
          max: m.maxWeight,
          entries: m.count
        })),
        summary: {
          startWeight: firstWeight,
          currentWeight: lastWeight,
          totalChange: Math.round(totalChange * 10) / 10,
          totalEntries: weights.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/steps
// @desc    Get steps analytics
// @access  Private
router.get('/steps', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const userId = req.user._id;

    let dateFilter = {};
    const now = new Date();

    if (period === 'week') {
      dateFilter = { $gte: new Date(now.setDate(now.getDate() - 7)) };
    } else if (period === 'month') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
    } else if (period === '3months') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 3)) };
    }

    const matchQuery = { userId };
    if (Object.keys(dateFilter).length > 0) {
      matchQuery.date = dateFilter;
    }

    // Daily steps
    const dailySteps = await Steps.find(matchQuery).sort({ date: 1 });

    // Weekly summary
    const weeklySummary = await Steps.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$week',
          totalSteps: { $sum: '$count' },
          avgSteps: { $avg: '$count' },
          maxSteps: { $max: '$count' },
          minSteps: { $min: '$count' },
          daysTracked: { $sum: 1 },
          goalsMet: {
            $sum: { $cond: [{ $gte: ['$count', '$goal'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Monthly summary
    const monthlySummary = await Steps.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          totalSteps: { $sum: '$count' },
          avgSteps: { $avg: '$count' },
          maxSteps: { $max: '$count' },
          daysTracked: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Overall stats
    const overallStats = await Steps.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalSteps: { $sum: '$count' },
          avgSteps: { $avg: '$count' },
          maxSteps: { $max: '$count' },
          totalDays: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        daily: dailySteps,
        weekly: weeklySummary.map(w => ({
          week: w._id,
          total: w.totalSteps,
          avg: Math.round(w.avgSteps),
          max: w.maxSteps,
          min: w.minSteps,
          daysTracked: w.daysTracked,
          goalsMet: w.goalsMet
        })),
        monthly: monthlySummary.map(m => ({
          month: m._id,
          total: m.totalSteps,
          avg: Math.round(m.avgSteps),
          max: m.maxSteps,
          daysTracked: m.daysTracked
        })),
        overall: overallStats[0] ? {
          totalSteps: overallStats[0].totalSteps,
          avgSteps: Math.round(overallStats[0].avgSteps),
          maxSteps: overallStats[0].maxSteps,
          totalDays: overallStats[0].totalDays
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/workouts
// @desc    Get workout analytics
// @access  Private
router.get('/workouts', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const userId = req.user._id;

    let dateFilter = {};
    const now = new Date();

    if (period === 'week') {
      dateFilter = { $gte: new Date(now.setDate(now.getDate() - 7)) };
    } else if (period === 'month') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
    } else if (period === '3months') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 3)) };
    }

    const matchQuery = { userId };
    if (Object.keys(dateFilter).length > 0) {
      matchQuery.date = dateFilter;
    }

    // Weekly workout count
    const weeklySummary = await Workout.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$week',
          totalWorkouts: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          totalCalories: { $sum: '$caloriesBurned' },
          totalExercises: { $sum: { $size: '$exercises' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Exercise frequency
    const exerciseFrequency = await Workout.aggregate([
      { $match: matchQuery },
      { $unwind: '$exercises' },
      {
        $group: {
          _id: '$exercises.name',
          count: { $sum: 1 },
          avgSets: { $avg: '$exercises.sets' },
          avgReps: { $avg: '$exercises.reps' },
          avgWeight: { $avg: '$exercises.weight' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Monthly summary
    const monthlySummary = await Workout.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          totalWorkouts: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          totalCalories: { $sum: '$caloriesBurned' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Overall stats
    const overallStats = await Workout.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalWorkouts: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          totalCalories: { $sum: '$caloriesBurned' },
          avgDuration: { $avg: '$duration' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        weekly: weeklySummary.map(w => ({
          week: w._id,
          workouts: w.totalWorkouts,
          duration: w.totalDuration || 0,
          calories: w.totalCalories || 0,
          exercises: w.totalExercises
        })),
        monthly: monthlySummary.map(m => ({
          month: m._id,
          workouts: m.totalWorkouts,
          duration: m.totalDuration || 0,
          calories: m.totalCalories || 0
        })),
        topExercises: exerciseFrequency.map(e => ({
          name: e._id,
          count: e.count,
          avgSets: Math.round(e.avgSets),
          avgReps: Math.round(e.avgReps),
          avgWeight: Math.round(e.avgWeight * 10) / 10
        })),
        overall: overallStats[0] ? {
          totalWorkouts: overallStats[0].totalWorkouts,
          totalDuration: overallStats[0].totalDuration || 0,
          totalCalories: overallStats[0].totalCalories || 0,
          avgDuration: Math.round(overallStats[0].avgDuration || 0)
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/meals
// @desc    Get meal/nutrition analytics
// @access  Private
router.get('/meals', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const userId = req.user._id;

    let dateFilter = {};
    const now = new Date();

    if (period === 'week') {
      dateFilter = { $gte: new Date(now.setDate(now.getDate() - 7)) };
    } else if (period === 'month') {
      dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
    }

    const matchQuery = { userId };
    if (Object.keys(dateFilter).length > 0) {
      matchQuery.date = dateFilter;
    }

    // Daily nutrition
    const dailyNutrition = await Meal.aggregate([
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
      { $sort: { _id: 1 } }
    ]);

    // Weekly averages
    const weeklyAvg = await Meal.aggregate([
      { $match: matchQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$week',
          avgCalories: { $avg: '$items.calories' },
          avgProtein: { $avg: '$items.protein' },
          avgCarbs: { $avg: '$items.carbs' },
          avgFats: { $avg: '$items.fats' },
          totalItems: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Meal type distribution
    const mealTypeDistribution = await Meal.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$mealType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Overall averages
    const overallAvg = await Meal.aggregate([
      { $match: { userId } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          dailyCalories: { $sum: '$items.calories' },
          dailyProtein: { $sum: '$items.protein' },
          dailyCarbs: { $sum: '$items.carbs' },
          dailyFats: { $sum: '$items.fats' }
        }
      },
      {
        $group: {
          _id: null,
          avgDailyCalories: { $avg: '$dailyCalories' },
          avgDailyProtein: { $avg: '$dailyProtein' },
          avgDailyCarbs: { $avg: '$dailyCarbs' },
          avgDailyFats: { $avg: '$dailyFats' },
          daysTracked: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        daily: dailyNutrition.map(d => ({
          date: d._id,
          calories: Math.round(d.totalCalories),
          protein: Math.round(d.totalProtein),
          carbs: Math.round(d.totalCarbs),
          fats: Math.round(d.totalFats),
          meals: d.mealCount
        })),
        weekly: weeklyAvg.map(w => ({
          week: w._id,
          avgCalories: Math.round(w.avgCalories),
          avgProtein: Math.round(w.avgProtein),
          avgCarbs: Math.round(w.avgCarbs),
          avgFats: Math.round(w.avgFats),
          itemsLogged: w.totalItems
        })),
        mealTypes: mealTypeDistribution.map(m => ({
          type: m._id,
          count: m.count
        })),
        averages: overallAvg[0] ? {
          dailyCalories: Math.round(overallAvg[0].avgDailyCalories),
          dailyProtein: Math.round(overallAvg[0].avgDailyProtein),
          dailyCarbs: Math.round(overallAvg[0].avgDailyCarbs),
          dailyFats: Math.round(overallAvg[0].avgDailyFats),
          daysTracked: overallAvg[0].daysTracked
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/export
// @desc    Export analytics data
// @access  Private
router.get('/export', async (req, res, next) => {
  try {
    const { type = 'all', format = 'json' } = req.query;
    const userId = req.user._id;

    const data = {};

    if (type === 'all' || type === 'weight') {
      data.weights = await Weight.find({ userId }).sort({ date: 1 });
    }

    if (type === 'all' || type === 'steps') {
      data.steps = await Steps.find({ userId }).sort({ date: 1 });
    }

    if (type === 'all' || type === 'workouts') {
      data.workouts = await Workout.find({ userId }).sort({ date: 1 });
    }

    if (type === 'all' || type === 'meals') {
      data.meals = await Meal.find({ userId }).sort({ date: 1 });
    }

    if (format === 'csv') {
      // Convert to CSV format
      let csv = '';

      if (data.weights) {
        csv += 'WEIGHT DATA\nWeek,Date,Weight,Unit,Notes\n';
        data.weights.forEach(w => {
          csv += `${w.week},${w.date.toISOString().split('T')[0]},${w.weight},${w.unit},${w.notes || ''}\n`;
        });
        csv += '\n';
      }

      if (data.steps) {
        csv += 'STEPS DATA\nWeek,Date,Steps,Goal\n';
        data.steps.forEach(s => {
          csv += `${s.week},${s.date.toISOString().split('T')[0]},${s.count},${s.goal}\n`;
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=fitness-data-export.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

export default router;
