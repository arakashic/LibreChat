const express = require('express');
const {
  getManagedModelsHandler,
  activateManagedModelHandler,
  cancelModelOperationHandler,
} = require('@librechat/api');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth, configMiddleware);
router.get('/', getManagedModelsHandler);
router.post('/models/:modelId/activate', activateManagedModelHandler);
router.post('/operations/:operationId/cancel', cancelModelOperationHandler);

module.exports = router;
