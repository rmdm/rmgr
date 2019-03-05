const promback = require('promback')
const timeoutable = require('timeoutable-wrapper')

function noop () {}

function using (PromiseLib) {

    function defer () {

        let resolve, promise

        promise = new PromiseLib(function (_resolve) {
            resolve = _resolve
        })

        return { resolve, promise }
    }

    const prombackProm = promback.using(PromiseLib)

    const rmgr = function () {

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
                        throw new Error('"init" must be a function.')
                    }

                    if (typeof dispose !== 'function') {
                        throw new Error('"dispose" must be a function.')
                    }

                    init = prombackProm(init)
                    dispose = prombackProm(dispose)

                    const initPromise = init()

                    pending.push(initPromise.then(noop, noop))

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

                await PromiseLib.all(pending)

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

    const timeout = timeoutable.using(PromiseLib)

    rmgr.timeout = timeout
    rmgr.TimeoutError = timeoutable.TimeoutError

    return rmgr
}

module.exports = using(Promise)
module.exports.using = using
