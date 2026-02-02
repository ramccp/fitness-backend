import mongoose from 'mongoose';

const mealItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Food item name is required'],
    trim: true
  },
  quantity: {
    type: String,
    required: [true, 'Quantity is required']
  },
  calories: {
    type: Number,
    min: 0,
    default: 0
  },
  protein: {
    type: Number, // in grams
    min: 0,
    default: 0
  },
  carbs: {
    type: Number, // in grams
    min: 0,
    default: 0
  },
  fats: {
    type: Number, // in grams
    min: 0,
    default: 0
  }
}, { _id: true });

const mealSchema = new mongoose.Schema({
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
  mealType: {
    type: String,
    required: true,
    enum: ['upon_wakeup', 'pre_workout', 'breakfast', 'lunch', 'snacks', 'dinner', 'other']
  },
  items: [mealItemSchema],
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Index for efficient queries
mealSchema.index({ userId: 1, date: -1 });
mealSchema.index({ userId: 1, week: 1 });
mealSchema.index({ userId: 1, date: 1, mealType: 1 });

// Virtual for total calories
mealSchema.virtual('totalCalories').get(function() {
  return this.items.reduce((sum, item) => sum + (item.calories || 0), 0);
});

// Virtual for total macros
mealSchema.virtual('totalMacros').get(function() {
  return this.items.reduce((totals, item) => ({
    protein: totals.protein + (item.protein || 0),
    carbs: totals.carbs + (item.carbs || 0),
    fats: totals.fats + (item.fats || 0)
  }), { protein: 0, carbs: 0, fats: 0 });
});

mealSchema.set('toJSON', { virtuals: true });
mealSchema.set('toObject', { virtuals: true });

const Meal = mongoose.model('Meal', mealSchema);

export default Meal;
