import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import Weight from '../models/Weight.js';
import Plan from '../models/Plan.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication
router.use(protect);

// Helper to get current week from plan
const getCurrentWeek = async (userId) => {
  const plan = await Plan.findOne({
    userId,
    status: { $in: ['active', 'paused'] }
  });
  return plan ? plan.calculateCurrentWeek() : 1;
};

// @route   POST /api/weight
// @desc    Add weight entry
// @access  Private
router.post('/', async (req, res, next) => {
  try {
    const { weight, unit, date, notes, week } = req.body;

    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    const entryWeek = week || (plan ? plan.calculateCurrentWeek() : 1);

    const weightEntry = await Weight.create({
      userId: req.user._id,
      planId: plan?._id,
      weight,
      unit: unit || 'kg',
      date: date ? new Date(date) : new Date(),
      notes,
      week: entryWeek
    });

    res.status(201).json({
      success: true,
      data: weightEntry
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/weight
// @desc    Get all weight entries
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, startDate, endDate, week } = req.query;

    const query = { userId: req.user._id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (week) {
      query.week = parseInt(week);
    }

    const weights = await Weight.find(query)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Weight.countDocuments(query);

    res.json({
      success: true,
      data: {
        weights,
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

// @route   GET /api/weight/weekly
// @desc    Get weekly weight summary
// @access  Private
router.get('/weekly', async (req, res, next) => {
  try {
    const weights = await Weight.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$week',
          avgWeight: { $avg: '$weight' },
          minWeight: { $min: '$weight' },
          maxWeight: { $max: '$weight' },
          entries: { $sum: 1 },
          lastEntry: { $last: '$weight' },
          firstEntry: { $first: '$weight' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate week-over-week change
    const weeklySummary = weights.map((week, index) => ({
      week: week._id,
      avgWeight: Math.round(week.avgWeight * 10) / 10,
      minWeight: week.minWeight,
      maxWeight: week.maxWeight,
      entries: week.entries,
      change: index > 0 ? Math.round((week.avgWeight - weights[index - 1].avgWeight) * 10) / 10 : 0
    }));

    res.json({
      success: true,
      data: weeklySummary
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/weight/bulk-upload
// @desc    Bulk upload weight entries via CSV
// @access  Private
router.post('/bulk-upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }

    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV - expected format: Week,Date,Weight,Notes
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is empty or invalid format'
      });
    }

    const plan = await Plan.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'paused'] }
    });

    const weightEntries = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNum = i + 2; // +2 for header and 0-indexing

      try {
        const week = parseInt(record.Week || record.week);
        const date = new Date(record.Date || record.date);
        const weight = parseFloat(record.Weight || record.weight);
        const notes = record.Notes || record.notes || '';

        if (isNaN(week) || isNaN(weight) || isNaN(date.getTime())) {
          errors.push(`Row ${rowNum}: Invalid data format`);
          continue;
        }

        weightEntries.push({
          userId: req.user._id,
          planId: plan?._id,
          week,
          date,
          weight,
          notes,
          unit: 'kg'
        });
      } catch (err) {
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    if (weightEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid entries found in CSV',
        errors
      });
    }

    // Insert all valid entries
    const inserted = await Weight.insertMany(weightEntries, { ordered: false });

    res.json({
      success: true,
      message: `Successfully uploaded ${inserted.length} weight entries`,
      data: {
        inserted: inserted.length,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/weight/:id
// @desc    Get single weight entry
// @access  Private
router.get('/:id', async (req, res, next) => {
  try {
    const weight = await Weight.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!weight) {
      return res.status(404).json({
        success: false,
        message: 'Weight entry not found'
      });
    }

    res.json({
      success: true,
      data: weight
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/weight/:id
// @desc    Update weight entry
// @access  Private
router.put('/:id', async (req, res, next) => {
  try {
    const { weight, unit, date, notes, week } = req.body;

    const weightEntry = await Weight.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { weight, unit, date, notes, week },
      { new: true, runValidators: true }
    );

    if (!weightEntry) {
      return res.status(404).json({
        success: false,
        message: 'Weight entry not found'
      });
    }

    res.json({
      success: true,
      data: weightEntry
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/weight/:id
// @desc    Delete weight entry
// @access  Private
router.delete('/:id', async (req, res, next) => {
  try {
    const weight = await Weight.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!weight) {
      return res.status(404).json({
        success: false,
        message: 'Weight entry not found'
      });
    }

    res.json({
      success: true,
      message: 'Weight entry deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
