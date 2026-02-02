import express from 'express';
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(protect, admin);

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Admin
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, role } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    // Get plan status for each user
    const usersWithPlan = await Promise.all(
      users.map(async (user) => {
        const plan = await Plan.findOne({ userId: user._id }).sort({ createdAt: -1 });
        return {
          ...user.toObject(),
          activePlan: plan ? {
            status: plan.status,
            currentWeek: plan.calculateCurrentWeek(),
            totalWeeks: plan.numberOfWeeks
          } : null
        };
      })
    );

    res.json({
      success: true,
      data: {
        users: usersWithPlan,
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

// @route   POST /api/admin/users
// @desc    Create a new user
// @access  Admin
router.post('/users', async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, and name'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const user = await User.create({
      email,
      password,
      name,
      role: role || 'user'
    });

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/users/:id
// @desc    Get user by ID
// @access  Admin
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const plan = await Plan.findOne({ userId: user._id }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        activePlan: plan || null
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user
// @access  Admin
router.put('/users/:id', async (req, res, next) => {
  try {
    const { name, email, role, isActive } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deactivating themselves
    if (req.user._id.toString() === req.params.id && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    // Check if email is taken by another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (email !== undefined) updateFields.email = email;
    if (role !== undefined) updateFields.role = role;
    if (isActive !== undefined) updateFields.isActive = isActive;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete user
// @access  Admin
router.delete('/users/:id', async (req, res, next) => {
  try {
    // Prevent admin from deleting themselves
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/admin/users/:id/reset-password
// @desc    Reset user password
// @access  Admin
router.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin dashboard stats
// @access  Admin
router.get('/stats', async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const activeUsers = await User.countDocuments({ role: 'user', isActive: true });
    const activePlans = await Plan.countDocuments({ status: 'active' });
    const pausedPlans = await Plan.countDocuments({ status: 'paused' });
    const completedPlans = await Plan.countDocuments({ status: 'completed' });

    // Recent signups (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSignups = await User.countDocuments({
      role: 'user',
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        activePlans,
        pausedPlans,
        completedPlans,
        recentSignups
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
