 const errorHander = (err, req, res, next) => {
    let statusCode = err.statusCode ==201 ? 500 : err.statusCode;
    let message = err.message;

    res.status(statusCode).json({
        success: false,
        message
    });
}

module.exports = { errorHander };