import mongoose from 'mongoose';

const mealItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: String, required: true }
}, { _id: false });

const mealSchema = new mongoose.Schema({
  time: {
    type: String,
    required: true,
    enum: ['upon_wakeup', 'oil_for_cooking', 'pre_workout', 'breakfast', 'lunch', 'snacks', 'dinner']
  },
  items: [mealItemSchema]
}, { _id: false });

const planSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  numberOfWeeks: {
    type: Number,
    required: [true, 'Number of weeks is required'],
    min: [1, 'Plan must be at least 1 week'],
    max: [52, 'Plan cannot exceed 52 weeks']
  },
  currentWeek: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active'
  },
  pausedAt: {
    type: Date,
    default: null
  },
  pausedDays: {
    type: Number,
    default: 0
  },
  dietPlan: {
    meals: [mealSchema],
    totalCalories: { type: Number, default: 0 },
    macros: {
      carbs: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      fats: { type: Number, default: 0 }
    }
  },
  goals: {
    targetWeight: { type: Number },
    dailyStepsGoal: { type: Number, default: 10000 },
    weeklyWorkoutGoal: { type: Number, default: 4 }
  }
}, {
  timestamps: true
});

// Calculate current week based on start date
planSchema.methods.calculateCurrentWeek = function() {
  if (this.status === 'paused') {
    return this.currentWeek;
  }

  const now = new Date();
  const start = new Date(this.startDate);
  const diffTime = now - start - (this.pausedDays * 24 * 60 * 60 * 1000);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;

  return Math.min(Math.max(week, 1), this.numberOfWeeks);
};

// Check if plan is completed
planSchema.methods.isCompleted = function() {
  return this.calculateCurrentWeek() > this.numberOfWeeks;
};

// Virtual for end date
planSchema.virtual('endDate').get(function() {
  const end = new Date(this.startDate);
  end.setDate(end.getDate() + (this.numberOfWeeks * 7) + this.pausedDays);
  return end;
});

planSchema.set('toJSON', { virtuals: true });
planSchema.set('toObject', { virtuals: true });

const Plan = mongoose.model('Plan', planSchema);

export default Plan;
