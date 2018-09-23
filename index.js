module.exports = function () {

    const disposes = []

    let closed = false

    function checkClosed () {
        if (closed) {
            throw new Error('rmgr instance already closed.')
        }
    }

    const resources = {

        add: async function (init, dispose) {

            checkClosed()

            if (typeof dispose !== 'function') {
                throw new Error('dispose must be a function.')
            }

            try {
                const resource = await init()
                disposes.push(function () {
                    return dispose(resource)
                })
                return resource
            } catch (err) {
                try {
                    await resources.close()
                } catch (closeErr) { err.other = [ closeErr ] }
                throw err
            }
        },

        close: async function () {
            checkClosed()
            closed = true
            let errs = []
            while (disposes.length) {
                try {
                    const dispose = disposes.pop()
                    await dispose()
                } catch (err) {
                    errs.push(err)
                }
            }
            if (errs.length) {
                const e = errs.shift()
                e.other = errs
                throw e
            }
        },
    }

    return resources
}
