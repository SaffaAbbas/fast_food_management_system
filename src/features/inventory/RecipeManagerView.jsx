import React, { useState, useEffect } from 'react'
import {
  ScrollText,
  Plus,
  Search,
  DollarSign,
  Percent,
  Trash2,
  Edit,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  ChefHat,
  TrendingUp,
  Sparkles,
  PieChart,
  ArrowLeft
} from 'lucide-react'
import ImagePicker from '../../components/ImagePicker.jsx'

export default function RecipeManagerView({ onBack }) {
  const [recipes, setRecipes] = useState([])
  const [products, setProducts] = useState([])
  const [rawItems, setRawItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Editor Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [yieldQuantity, setYieldQuantity] = useState('1.0')
  const [recipeNotes, setRecipeNotes] = useState('')
  const [recipeIngredients, setRecipeIngredients] = useState([]) // Array of { inventoryItemId, quantityRequired, wastagePercentage }
  const [recipeImageUrl, setRecipeImageUrl] = useState(null)

  // Toast
  const [toast, setToast] = useState(null)

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = async () => {
    setLoading(true)
    try {
      if (window.api?.recipes) {
        const [recipesRes, productsRes, rawItemsRes] = await Promise.all([
          window.api.recipes.getRecipes(),
          window.api.product?.getProducts ? window.api.product.getProducts({ includeInactive: false }) : [],
          window.api.inventory?.getItems ? window.api.inventory.getItems() : [],
        ])

        setRecipes(recipesRes || [])
        setProducts(productsRes || [])
        setRawItems(rawItemsRes || [])
      }
    } catch (err) {
      console.error('Failed to load recipes:', err)
      showToast('error', `Failed to load recipe data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Open Editor for New Recipe
  const handleOpenNewRecipe = () => {
    setEditingRecipe(null)
    setSelectedProductId(products[0]?.id || '')
    setYieldQuantity('1.0')
    setRecipeNotes('')
    setRecipeImageUrl(null)
    setRecipeIngredients([
      { inventoryItemId: rawItems[0]?.id || '', quantityRequired: '1.0', wastagePercentage: '0.0' },
    ])
    setIsEditorOpen(true)
  }

  // Open Editor for Existing Recipe
  const handleOpenEditRecipe = (rec) => {
    setEditingRecipe(rec)
    setSelectedProductId(rec.product_id)
    setYieldQuantity(String(rec.yield_quantity || 1.0))
    setRecipeNotes(rec.notes || '')
    setRecipeImageUrl(rec.image_url || null)
    setRecipeIngredients(
      rec.ingredients.map((ing) => ({
        inventoryItemId: ing.inventory_item_id,
        quantityRequired: String(ing.quantity_required),
        wastagePercentage: String(ing.wastage_percentage || 0),
      }))
    )
    setIsEditorOpen(true)
  }

  // Add Ingredient Row in Editor
  const handleAddIngredientRow = () => {
    setRecipeIngredients([
      ...recipeIngredients,
      { inventoryItemId: rawItems[0]?.id || '', quantityRequired: '1.0', wastagePercentage: '0.0' },
    ])
  }

  // Remove Ingredient Row
  const handleRemoveIngredientRow = (index) => {
    setRecipeIngredients(recipeIngredients.filter((_, idx) => idx !== index))
  }

  // Update Ingredient Row
  const handleUpdateIngredientRow = (index, field, value) => {
    const updated = [...recipeIngredients]
    updated[index][field] = value
    setRecipeIngredients(updated)
  }

  // Save Recipe
  const handleSaveRecipe = async (e) => {
    e.preventDefault()
    if (!selectedProductId) {
      showToast('error', 'Please select a menu product.')
      return
    }

    if (recipeIngredients.length === 0) {
      showToast('error', 'Add at least one raw ingredient to the recipe.')
      return
    }

    try {
      await window.api.recipes.saveRecipe({
        productId: selectedProductId,
        variationId: editingRecipe?.variation_id || null,
        yieldQuantity: parseFloat(yieldQuantity || 1.0),
        notes: recipeNotes,
        imageUrl: recipeImageUrl,
        ingredients: recipeIngredients.map((ing) => ({
          inventoryItemId: ing.inventoryItemId,
          quantityRequired: parseFloat(ing.quantityRequired || 1.0),
          wastagePercentage: parseFloat(ing.wastagePercentage || 0),
        })),
      })

      showToast('success', 'Recipe and food cost saved successfully!')
      setIsEditorOpen(false)
      loadData()
    } catch (err) {
      showToast('error', `Failed to save recipe: ${err.message}`)
    }
  }

  // Calculate live editor food cost
  const selectedProd = products.find((p) => p.id === selectedProductId)
  const currentSellingPriceCents = selectedProd?.base_price_cents || 0

  const editorFoodCostCents = recipeIngredients.reduce((sum, ing) => {
    const raw = rawItems.find((r) => r.id === ing.inventoryItemId)
    if (!raw) return sum
    const qty = parseFloat(ing.quantityRequired || 0)
    const waste = 1 + parseFloat(ing.wastagePercentage || 0) / 100
    return sum + Math.round(qty * waste * (raw.cost_per_unit_cents || 0))
  }, 0)

  const editorGrossProfitCents = Math.max(0, currentSellingPriceCents - editorFoodCostCents)
  const editorFoodCostPct = currentSellingPriceCents > 0
    ? ((editorFoodCostCents / currentSellingPriceCents) * 100).toFixed(1)
    : 0

  // Filter recipes by search query
  const filteredRecipes = recipes.filter((r) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return r.product_name?.toLowerCase().includes(q) || r.category_name?.toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] gap-4 select-none">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2 text-xs font-semibold animate-fade-in ${
          toast.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-800 text-emerald-200'
            : 'bg-rose-950/95 border-rose-800 text-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-all shadow-sm"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-orange-400" />
              <span>Back</span>
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
            <ScrollText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Recipes & Food Cost Management
            </h1>
            <p className="text-xs text-slate-400">
              Ingredient portions, prep loss & real-time gross margin calculation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter recipes by dish name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <button
            onClick={handleOpenNewRecipe}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Recipe</span>
          </button>
        </div>
      </div>

      {/* Recipes Cards Grid */}
      <div className="flex-1 overflow-y-auto">
        {loading && recipes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
            <ChefHat className="w-8 h-8 animate-bounce text-orange-500" />
            <span className="text-xs font-semibold">Loading recipes & food cost analysis...</span>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 p-12 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800">
            <ScrollText className="w-10 h-10 opacity-30" />
            <div>
              <h3 className="text-sm font-bold text-white">No Recipes Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Create a recipe for your sellable food items to automatically deduct raw stock and track gross margins.
              </p>
            </div>
            <button
              onClick={handleOpenNewRecipe}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold"
            >
              Configure First Recipe
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {filteredRecipes.map((rec) => {
              const isHighProfit = rec.foodCostPercentage <= 30
              const isModerateProfit = rec.foodCostPercentage > 30 && rec.foodCostPercentage <= 40
              const isHighCost = rec.foodCostPercentage > 40

              return (
                <div
                  key={rec.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg hover:border-slate-700 transition-all"
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white leading-tight">
                          {rec.product_name}
                        </h3>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {rec.category_name} {rec.variation_name ? `• ${rec.variation_name}` : ''}
                        </div>
                      </div>

                      {/* Food Cost % Badge */}
                      <span className={`text-[11px] font-black font-mono px-2 py-0.5 rounded-lg border ${
                        isHighProfit
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                          : isModerateProfit
                          ? 'bg-amber-950 text-amber-300 border-amber-800/60'
                          : 'bg-rose-950 text-rose-300 border-rose-800/60'
                      }`}>
                        {rec.foodCostPercentage}% Cost
                      </span>
                    </div>

                    {/* Financial Metrics Strip */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 mt-3 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Selling Price</div>
                        <div className="text-xs font-mono font-bold text-white mt-0.5">
                          ${(rec.sellingPriceCents / 100).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Food Cost</div>
                        <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                          ${(rec.foodCostCents / 100).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Gross Profit</div>
                        <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
                          ${(rec.grossMarginCents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Ingredients Summary */}
                    <div className="mt-3 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Recipe Components ({rec.ingredients?.length || 0})
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {rec.ingredients?.map((ing) => (
                          <div
                            key={ing.id}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-950/60 border border-slate-800/50"
                          >
                            <span className="text-slate-300 truncate">{ing.item_name}</span>
                            <span className="font-mono font-bold text-slate-400 shrink-0">
                              {ing.quantity_required} {ing.unit_abbr}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs">
                    <span className="text-[10px] text-slate-500">
                      Yield: {rec.yield_quantity || 1.0} serving
                    </span>
                    <button
                      onClick={() => handleOpenEditRecipe(rec)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit Recipe</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recipe Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-orange-400" />
                {editingRecipe ? 'Edit Recipe & Costing' : 'Configure New Recipe'}
              </h2>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecipe} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <ImagePicker label="Recipe photo" value={recipeImageUrl} onChange={setRecipeImageUrl} />
              {/* Product Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Sellable Menu Item *</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    disabled={!!editingRecipe}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 disabled:opacity-60"
                    required
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${(p.base_price_cents / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Yield Quantity (Servings)</label>
                  <input
                    type="number"
                    step="any"
                    value={yieldQuantity}
                    onChange={(e) => setYieldQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Live Costing Bar */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Selling Price</div>
                  <div className="text-sm font-mono font-bold text-white mt-0.5">
                    ${(currentSellingPriceCents / 100).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Calculated Food Cost</div>
                  <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">
                    ${(editorFoodCostCents / 100).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Food Cost Margin</div>
                  <div className={`text-sm font-mono font-bold mt-0.5 ${
                    editorFoodCostPct <= 30 ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {editorFoodCostPct}% (${(editorGrossProfitCents / 100).toFixed(2)} profit)
                  </div>
                </div>
              </div>

              {/* Recipe Ingredients Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase">Recipe Ingredients</span>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Ingredient</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {recipeIngredients.map((ing, idx) => {
                    const raw = rawItems.find((r) => r.id === ing.inventoryItemId)
                    const rowCost = raw
                      ? Math.round(
                          parseFloat(ing.quantityRequired || 0) *
                            (1 + parseFloat(ing.wastagePercentage || 0) / 100) *
                            (raw.cost_per_unit_cents || 0)
                        )
                      : 0

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                      >
                        {/* Ingredient Picker */}
                        <div className="sm:col-span-5">
                          <label className="text-[10px] text-slate-500 block mb-0.5">Ingredient</label>
                          <select
                            value={ing.inventoryItemId}
                            onChange={(e) => handleUpdateIngredientRow(idx, 'inventoryItemId', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                          >
                            {rawItems.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.unit_abbr}) - ${(r.cost_per_unit_cents / 100).toFixed(2)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Qty */}
                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-slate-500 block mb-0.5">Qty per Serving</label>
                          <input
                            type="number"
                            step="any"
                            value={ing.quantityRequired}
                            onChange={(e) => handleUpdateIngredientRow(idx, 'quantityRequired', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                            required
                          />
                        </div>

                        {/* Wastage % */}
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-slate-500 block mb-0.5">Wastage %</label>
                          <input
                            type="number"
                            step="any"
                            value={ing.wastagePercentage}
                            onChange={(e) => handleUpdateIngredientRow(idx, 'wastagePercentage', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                          />
                        </div>

                        {/* Cost & Delete */}
                        <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0">
                          <span className="text-xs font-mono font-bold text-amber-300">
                            ${(rowCost / 100).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredientRow(idx)}
                            disabled={recipeIngredients.length <= 1}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Chef Notes */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Preparation & Assembly Notes</label>
                <textarea
                  placeholder="e.g. Toast buns on buttered flat top for 45s, layer cheese on hot patty immediately..."
                  value={recipeNotes}
                  onChange={(e) => setRecipeNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 resize-none h-16"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Recipe & Costing</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
