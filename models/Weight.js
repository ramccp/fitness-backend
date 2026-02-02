import mongoose from 'mongoose';

const weightSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  week: {
    type: Number,
    required: true,
    min: 1
  },
  weight: {
    type: Number,
    required: [true, 'Weight is required'],
    min: [20, 'Weight must be at least 20'],
    max: [500, 'Weight cannot exceed 500']
  },
  unit: {
    type: String,
    enum: ['kg', 'lbs'],
    default: 'kg'
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Index for efficient queries
weightSchema.index({ userId: 1, date: -1 });
weightSchema.index({ userId: 1, week: 1 });

const Weight = mongoose.model('Weight', weightSchema);

export default Weight;
