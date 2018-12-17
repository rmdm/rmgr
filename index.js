const promback = require('promback')

module.exports = function () {

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

                init = promback(init)
                dispose = promback(dispose)

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

function noop () {}

function defer () {

    let resolve, promise

    promise = new Promise(function (_resolve) {
        resolve = _resolve
    })

    return { resolve, promise }
}
