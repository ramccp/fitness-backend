import mongoose from 'mongoose';

const stepsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  week: {
    type: Number,
    required: true,
    min: 1
  },
  count: {
    type: Number,
    required: [true, 'Step count is required'],
    min: [0, 'Steps cannot be negative'],
    max: [100000, 'Steps cannot exceed 100,000']
  },
  goal: {
    type: Number,
    default: 10000
  },
  distance: {
    type: Number, // in km
    min: 0
  },
  caloriesBurned: {
    type: Number,
    min: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
stepsSchema.index({ userId: 1, date: -1 });
stepsSchema.index({ userId: 1, week: 1 });
// Unique index to prevent duplicate entries for the same day
stepsSchema.index({ userId: 1, date: 1 }, { unique: true });

// Virtual for goal percentage
stepsSchema.virtual('goalPercentage').get(function() {
  if (!this.goal || this.goal === 0) return 0;
  return Math.min(Math.round((this.count / this.goal) * 100), 100);
});

stepsSchema.set('toJSON', { virtuals: true });
stepsSchema.set('toObject', { virtuals: true });

const Steps = mongoose.model('Steps', stepsSchema);

export default Steps;
