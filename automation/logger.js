class Logger {
    static log(step, status, message = "", context = null) {
        const logEntry = {
            step,
            status,
            message: typeof message === 'string' ? message : JSON.stringify(message),
            ...context,
            timestamp: new Date().toISOString()
        };
        console.log(JSON.stringify(logEntry));
    }

    static info(step, message = "", context = null) {
        this.log(step, "INFO", message, context);
    }

    static success(step, message = "", context = null) {
        this.log(step, "SUCCESS", message, context);
    }

    static error(step, errMessage, context = null) {
        this.log(step, "ERROR", errMessage, context);
    }
}

module.exports = Logger;
