import mongoose from 'mongoose';

const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Exercise name is required'],
    trim: true
  },
  sets: {
    type: Number,
    required: true,
    min: 1
  },
  reps: {
    type: Number,
    required: true,
    min: 1
  },
  weight: {
    type: Number,
    default: 0
  },
  unit: {
    type: String,
    enum: ['kg', 'lbs'],
    default: 'kg'
  },
  notes: {
    type: String,
    maxlength: 200
  }
}, { _id: true });

const workoutSchema = new mongoose.Schema({
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
  name: {
    type: String,
    trim: true,
    default: 'Workout'
  },
  exercises: [exerciseSchema],
  duration: {
    type: Number, // in minutes
    min: 0
  },
  caloriesBurned: {
    type: Number,
    min: 0
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  completed: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
workoutSchema.index({ userId: 1, date: -1 });
workoutSchema.index({ userId: 1, week: 1 });

// Virtual for total volume (sets * reps * weight)
workoutSchema.virtual('totalVolume').get(function() {
  return this.exercises.reduce((total, ex) => {
    return total + (ex.sets * ex.reps * (ex.weight || 0));
  }, 0);
});

workoutSchema.set('toJSON', { virtuals: true });
workoutSchema.set('toObject', { virtuals: true });

const Workout = mongoose.model('Workout', workoutSchema);

export default Workout;
