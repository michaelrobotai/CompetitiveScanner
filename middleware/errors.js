'use strict';

function notFound(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
  }
  return res.status(404).render('error', {
    title: 'Not found',
    statusCode: 404,
    message: 'The page you were looking for does not exist.'
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      error: err.code || 'server_error',
      message: err.expose || status < 500 ? err.message : 'Internal server error'
    });
  }
  return res.status(status).render('error', {
    title: 'Something went wrong',
    statusCode: status,
    message: status < 500 ? err.message : 'An unexpected error occurred. Check the service logs for details.'
  });
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  if (code) err.code = code;
  return err;
}

module.exports = { notFound, errorHandler, httpError };
