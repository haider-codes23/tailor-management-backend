/**
 * Product Controller
 *
 * Thin HTTP layer that delegates to productService.
 * Handles request parsing and response formatting.
 *
 * Response format: { success: true, data: ..., meta?: ..., message?: ... }
 */

const productService = require("../services/productService");

// =========================================================================
// A. PRODUCT CRUD
// =========================================================================

async function listProducts(req, res, next) {
  try {
    const { search, category, active } = req.query;
    const result = await productService.listProducts({ search, category, active });

    return res.status(200).json({
      success: true,
      data: result.products,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
}

async function getProduct(req, res, next) {
  try {
    const product = await productService.getProductById(req.params.id);
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const product = await productService.createProduct(req.body);
    return res.status(201).json({
      success: true,
      data: product,
      message: "Product created successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "CREATE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      data: product,
      message: "Product updated successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "UPDATE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const result = await productService.deleteProduct(req.params.id);
    return res.status(200).json({ success: true, data: result, message: result.message });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "DELETE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// B. BOM CRUD
// =========================================================================

async function getProductBOMs(req, res, next) {
  try {
    const { size } = req.query;
    const result = await productService.getProductBOMs(req.params.productId, size || null);
    return res.status(200).json({
      success: true,
      data: result.boms,
      available_sizes: result.available_sizes,
      total: result.total,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function getActiveBOM(req, res, next) {
  try {
    const { size } = req.query;
    const result = await productService.getActiveBOM(req.params.productId, size || null);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function getBOM(req, res, next) {
  try {
    const bom = await productService.getBOMById(req.params.bomId);
    return res.status(200).json({ success: true, data: bom });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function createBOM(req, res, next) {
  try {
    const bom = await productService.createBOM(
      req.params.productId,
      req.body,
      req.user?.id || null
    );
    return res.status(201).json({
      success: true,
      data: bom,
      message: "BOM created successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "BOM_CREATE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

async function updateBOM(req, res, next) {
  try {
    const bom = await productService.updateBOM(req.params.bomId, req.body);
    return res.status(200).json({
      success: true,
      data: bom,
      message: "BOM updated successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "BOM_UPDATE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

async function deleteBOM(req, res, next) {
  try {
    const result = await productService.deleteBOM(req.params.bomId);
    return res.status(200).json({ success: true, data: result, message: result.message });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

// =========================================================================
// C. BOM ITEMS
// =========================================================================

async function getBOMItems(req, res, next) {
  try {
    const items = await productService.getBOMItems(req.params.bomId);
    return res.status(200).json({
      success: true,
      data: items,
      total: items.length,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function addBOMItem(req, res, next) {
  try {
    const item = await productService.addBOMItem(req.params.bomId, req.body);
    return res.status(201).json({
      success: true,
      data: item,
      message: "BOM item added successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "BOM_ITEM_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

async function updateBOMItem(req, res, next) {
  try {
    const item = await productService.updateBOMItem(req.params.itemId, req.body);
    return res.status(200).json({
      success: true,
      data: item,
      message: "BOM item updated successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "BOM_ITEM_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

async function deleteBOMItem(req, res, next) {
  try {
    const result = await productService.deleteBOMItem(req.params.itemId);
    return res.status(200).json({ success: true, data: result, message: result.message });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

// =========================================================================
// D. MEASUREMENT CHARTS
// =========================================================================

async function getMeasurementCharts(req, res, next) {
  try {
    const charts = await productService.getMeasurementCharts(req.params.productId);
    return res.status(200).json({ success: true, data: charts });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function updateSizeChart(req, res, next) {
  try {
    const charts = await productService.updateSizeChart(req.params.productId, req.body);
    return res.status(200).json({
      success: true,
      data: charts,
      message: "Size chart updated successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function updateHeightChart(req, res, next) {
  try {
    const charts = await productService.updateHeightChart(req.params.productId, req.body);
    return res.status(200).json({
      success: true,
      data: charts,
      message: "Height chart updated successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function initializeMeasurementCharts(req, res, next) {
  try {
    const charts = await productService.initializeMeasurementCharts(
      req.params.productId,
      req.body
    );
    return res.status(200).json({
      success: true,
      data: charts,
      message: "Measurement charts initialized successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function deleteSizeChart(req, res, next) {
  try {
    const result = await productService.deleteSizeChart(req.params.productId);
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

async function deleteHeightChart(req, res, next) {
  try {
    const result = await productService.deleteHeightChart(req.params.productId);
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

// =========================================================================
// E. READY STOCK
// =========================================================================

async function getReadyStock(req, res, next) {
  try {
    const result = await productService.getReadyStockForProduct(req.params.productId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  // Products
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  // BOMs
  getProductBOMs,
  getActiveBOM,
  getBOM,
  createBOM,
  updateBOM,
  deleteBOM,
  // BOM Items
  getBOMItems,
  addBOMItem,
  updateBOMItem,
  deleteBOMItem,
  // Measurement Charts
  getMeasurementCharts,
  updateSizeChart,
  updateHeightChart,
  initializeMeasurementCharts,
  deleteSizeChart,
  deleteHeightChart,
  // Ready Stock
  getReadyStock,
};