import express from 'express';
import Plan from '../models/Plan.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   POST /api/plan
// @desc    Create a new plan
// @access  Private
router.post('/', async (req, res, next) => {
  try {
    const { startDate, numberOfWeeks, dietPlan, goals } = req.body;

    // Check for existing active plan
    const existingPlan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active or paused plan. Please complete or cancel it first.'
      });
    }

    const plan = await Plan.create({
      userId: req.user._id,
      startDate: new Date(startDate),
      numberOfWeeks,
      dietPlan: dietPlan || {},
      goals: goals || {}
    });

    res.status(201).json({
      success: true,
      data: plan
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/plan
// @desc    Get user's current plan
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'No active plan found'
      });
    }

    // Update current week
    const currentWeek = plan.calculateCurrentWeek();

    // Check if plan should be marked as completed
    if (plan.status === 'active' && currentWeek > plan.numberOfWeeks) {
      plan.status = 'completed';
      await plan.save();
    }

    res.json({
      success: true,
      data: {
        ...plan.toObject(),
        currentWeek: plan.calculateCurrentWeek()
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/plan/all
// @desc    Get all user's plans (including completed)
// @access  Private
router.get('/all', async (req, res, next) => {
  try {
    const plans = await Plan.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: plans.map(plan => ({
        ...plan.toObject(),
        currentWeek: plan.calculateCurrentWeek()
      }))
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/plan/:id
// @desc    Get specific plan by ID
// @access  Private
router.get('/:id', async (req, res, next) => {
  try {
    const plan = await Plan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...plan.toObject(),
        currentWeek: plan.calculateCurrentWeek()
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/plan/pause
// @desc    Pause the current plan
// @access  Private
router.put('/pause', async (req, res, next) => {
  try {
    const plan = await Plan.findOne({
      userId: req.user._id,
      status: 'active'
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'No active plan to pause'
      });
    }

    plan.status = 'paused';
    plan.pausedAt = new Date();
    plan.currentWeek = plan.calculateCurrentWeek();
    await plan.save();

    res.json({
      success: true,
      message: 'Plan paused successfully',
      data: plan
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/plan/resume
// @desc    Resume a paused plan
// @access  Private
router.put('/resume', async (req, res, next) => {
  try {
    const plan = await Plan.findOne({
      userId: req.user._id,
      status: 'paused'
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'No paused plan to resume'
      });
    }

    // Calculate days paused
    const now = new Date();
    const pausedDays = Math.floor((now - plan.pausedAt) / (1000 * 60 * 60 * 24));
    plan.pausedDays += pausedDays;

    plan.status = 'active';
    plan.pausedAt = null;
    await plan.save();

    res.json({
      success: true,
      message: 'Plan resumed successfully',
      data: {
        ...plan.toObject(),
        currentWeek: plan.calculateCurrentWeek()
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/plan/:id
// @desc    Update plan details
// @access  Private
router.put('/:id', async (req, res, next) => {
  try {
    const { dietPlan, goals, numberOfWeeks } = req.body;

    const plan = await Plan.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    if (dietPlan) plan.dietPlan = dietPlan;
    if (goals) plan.goals = { ...plan.goals, ...goals };
    if (numberOfWeeks && numberOfWeeks >= plan.calculateCurrentWeek()) {
      plan.numberOfWeeks = numberOfWeeks;
    }

    await plan.save();

    res.json({
      success: true,
      data: {
        ...plan.toObject(),
        currentWeek: plan.calculateCurrentWeek()
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/plan/:id
// @desc    Cancel/Delete a plan
// @access  Private
router.delete('/:id', async (req, res, next) => {
  try {
    const plan = await Plan.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/plan/progress
// @desc    Get plan progress summary
// @access  Private
router.get('/progress/summary', async (req, res, next) => {
  try {
    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'No active plan found'
      });
    }

    const currentWeek = plan.calculateCurrentWeek();
    const totalDays = plan.numberOfWeeks * 7;
    const daysCompleted = (currentWeek - 1) * 7 + (new Date().getDay() || 7);
    const progressPercentage = Math.min(Math.round((daysCompleted / totalDays) * 100), 100);

    res.json({
      success: true,
      data: {
        currentWeek,
        totalWeeks: plan.numberOfWeeks,
        daysCompleted,
        totalDays,
        progressPercentage,
        status: plan.status,
        startDate: plan.startDate,
        endDate: plan.endDate,
        goals: plan.goals
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
