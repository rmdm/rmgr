const promback = require('promback')

function initRmgr ({ initTimeout, disposeTimeout } = {}) {

    const disposes = [], pending = []

    let closed = false, closing = null

    function checkClosed () {
        if (closed) {
            throw new Error('rmgr instance closed.')
        }
    }

    const resources = {

        add: async function (init, dispose) {

            checkClosed()

            if (closing) { return }

            try {

                if (typeof init !== 'function') {
                    throw new Error('init must be a function.')
                }

                if (typeof dispose !== 'function') {
                    throw new Error('dispose must be a function.')
                }

                init = timeoutable(promback(init), initTimeout)
                dispose = timeoutable(promback(dispose), disposeTimeout)

                const initPromise = init()

                pending.push(Promise.resolve(initPromise).then(noop, noop))

                const resource = await initPromise

                disposes.push(function () {
                    return dispose(resource)
                })

                return resource

            } catch (err) {

                try {
                    await resources.close()
                } catch (closeErr) {
                    err.closeError = closeErr
                }

                throw err
            }
        },

        close: async function () {

            checkClosed()

            if (closing) { return closing.promise }

            closing = defer()

            await Promise.all(pending)

            let errs = []

            while (disposes.length) {
                try {
                    const dispose = disposes.pop()
                    await dispose()
                } catch (err) {
                    errs.push(err)
                }
            }

            closed = true
            closing.resolve()

            if (errs.length) {
                const e = errs.shift()
                e.other = errs
                throw e
            }
        },
    }

    return resources
}

class TimeoutError extends Error {
    constructor (message) {
        super(message)
        this.name = 'TimeoutError'
        Error.captureStackTrace(this, TimeoutError)
    }
}

function noop () {}

function defer () {

    let resolve, promise

    promise = new Promise(function (_resolve) {
        resolve = _resolve
    })

    return { resolve, promise }
}

function timeoutable (fn, ms) {

    if (typeof ms === 'undefined') { return fn }

    return function (...args) {

        return new Promise(function (resolve, reject) {

            const t = setTimeout(function () {
                reject(new TimeoutError(`Timeout of ${ms}ms expired.`))
            }, ms)

            fn(...args)
                .then(function (result) {
                    clearTimeout(t)
                    resolve(result)
                }, function (err) {
                    clearTimeout(t)
                    reject(err)
                })
        })
    }
}

module.exports = initRmgr
module.exports.TimeoutError = TimeoutError
