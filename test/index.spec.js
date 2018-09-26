const assert = require('assert-match')
const { type } = assert.matchers
const sinon = require('sinon')

const Resources = require('../index')

describe('resource manager', function () {

    let resources

    beforeEach(function () {
        resources = Resources()
    })

    describe('add method', function () {

        it('throws when resource init is not a function', async function () {

            try {

                await resources.add()

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err.message, 'init must be a function.')
            }
        })

        it('throws when resource dispose is not a function', async function () {

            try {

                await resources.add(sinon.stub())

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err.message, 'dispose must be a function.')
            }
        })

        it('returns object created by the initializer', async function () {

            const o = {}

            const init = sinon.stub().resolves(o)

            const result = await resources.add(init, sinon.stub())

            assert.strictEqual(result, o)
        })

        it('passes callback to init function for convenience',
            async function () {

            const o = {}

            const init = function (cb) {
                setTimeout(() => cb(null, o), 10)
            }

            const result = await resources.add(init, sinon.stub())

            assert.strictEqual(result, o)
        })

        it('calls dispose methods in the reverse order for all previously '
            + 'added resources when init fails', async function () {

            const initError = new Error('Init error.')

            const badInit = sinon.stub().throws(initError)
            const dispose = sinon.stub()

            await resources.add(() => 1, dispose)
            await resources.add(() => 2, dispose)
            await resources.add(() => 3, dispose)

            try {

                await resources.add(badInit, dispose)

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err, initError)
                assert.deepStrictEqual(dispose.args, [ [ 3 ], [ 2 ], [ 1 ] ])
            }
        })

        it('does not throw when closing', async function () {

            const init1 = sinon.stub().resolves(timeout(10, 1))
            const init2 = sinon.stub().resolves(timeout(10, 2))
            const dispose = sinon.stub().resolves(timeout(10))

            resources.add(init1, dispose)

            const close = resources.close()

            resources.add(init2, dispose)

            await close
        })

        it('throws when closed', async function () {

            const init1 = sinon.stub().resolves(timeout(10, 1))
            const init2 = sinon.stub().resolves(timeout(10, 2))
            const dispose = sinon.stub().resolves(timeout(10))

            resources.add(init1, dispose)

            const close = resources.close()

            await close

            try {

                await resources.add(init2, dispose)

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err.message, 'rmgr instance closed.')
            }
        })

        it('throws original error even when disposes throw', async function () {

            const initError = new Error('Init error.')
            const disposeError1 = new Error('Some error from 1.')
            const disposeError3 = new Error('Some error from 3.')

            const badInit = sinon.stub().throws(initError)

            const dispose1 = sinon.stub().rejects(disposeError1)
            const dispose2 = sinon.stub()
            const dispose3 = sinon.stub().rejects(disposeError3)

            await resources.add(() => 1, dispose1)
            await resources.add(() => 2, dispose2)
            await resources.add(() => 3, dispose3)

            try {

                await resources.add(badInit, dispose2)

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err, initError)
                assert.strictEqual(err.closeError, disposeError3)
                assert.strictEqual(err.closeError.other.length, 1)
                assert.strictEqual(err.closeError.other[0], disposeError1)

                assert.deepStrictEqual(dispose3.args, [ [ 3 ] ])
                assert.deepStrictEqual(dispose2.args, [ [ 2 ] ])
                assert.deepStrictEqual(dispose1.args, [ [ 1 ] ])
            }
        })

        it('stops initializing resources when some resource initialization '
            + 'fails, even when adding in parallel', async function () {

            const initErr = new Error('Init error.')

            const init1 = sinon.stub().resolves(timeout(100, 1))
            const init2 = sinon.stub().callsFake(async function () {
                await timeout(50)
                throw initErr
            })
            const init3 = sinon.stub().resolves(3)
            const init4 = sinon.stub().resolves(4)
            const dispose = sinon.stub()

            resources.add(init1, dispose)
            const error = resources.add(init2, dispose)

            await timeout(10)

            resources.add(init3, dispose)

            await timeout(50)

            resources.add(init4, dispose)

            try {

                await error

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err, initErr)
                assert.deepStrictEqual(dispose.args, [ [ 1 ], [ 3 ] ])
                assert(init4.notCalled)
            }
        })

        it('properly releases initialized resources before rejecting '
            + 'Promise.all', async function () {

            const initErr = new Error('Init error.')

            const init1 = sinon.stub().resolves(timeout(100, 1))
            const init2 = sinon.stub().callsFake(async function () {
                await timeout(50)
                throw initErr
            })
            const init3 = sinon.stub().resolves(3)
            const init4 = sinon.stub().resolves(4)
            const dispose = sinon.stub()

            try {

                await Promise.all([
                    resources.add(init1, dispose),
                    resources.add(init2, dispose),
                    resources.add(init3, dispose),
                    resources.add(init4, dispose),
                ])

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err, initErr)
                assert.deepStrictEqual(dispose.args, [ [ 1 ], [ 4 ], [ 3 ] ])
            }
        })

        it('properly releases initialized resources before rejecting '
            + 'Promise.all with multiple errors', async function () {

            const initErr1 = new Error('Init error 1.')
            const initErr2 = new Error('Init error 2.')

            const init1 = sinon.stub().resolves(timeout(100, 1))
            const init2 = sinon.stub().callsFake(async function () {
                await timeout(50)
                throw initErr1
            })
            const init3 = sinon.stub().callsFake(async function () {
                await timeout(100)
                throw initErr2
            })
            const init4 = sinon.stub().resolves(4)
            const dispose = sinon.stub()

            try {

                await Promise.all([
                    resources.add(init1, dispose),
                    resources.add(init2, dispose),
                    resources.add(init3, dispose),
                    resources.add(init4, dispose),
                ])

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err, initErr1)
                assert.deepStrictEqual(dispose.args, [ [ 1 ], [ 4 ] ])
            }
        })
    })

    describe('close method', function () {

        it('calls dispose methods in the reverse order of addition',
            async function () {

            const dispose = sinon.stub()

            await resources.add(() => 1, dispose)
            await resources.add(() => 2, dispose)
            await resources.add(() => 3, dispose)

            await resources.close()

            assert.deepStrictEqual(dispose.args, [ [ 3 ], [ 2 ], [ 1 ] ])
        })

        it('passes callback to dispose function for convenience',
            async function () {

            const dispose = sinon.spy(function (resource, cb) {
                setTimeout(() => cb(null), 10)
            })

            await resources.add(() => 1, dispose)
            await resources.add(() => 2, dispose)
            await resources.add(() => 3, dispose)

            await resources.close()

            assert.deepStrictEqual(dispose.args, [
                [ 3, type('function') ],
                [ 2, type('function') ],
                [ 1, type('function') ],
            ])
        })

        it('calls all registered disposes even if some of them throws'
            + 'and returns initial error', async function () {

            const initError = new Error('Init error.')
            const disposeError1 = new Error('Some error from 1.')
            const disposeError3 = new Error('Some error from 3.')

            const dispose1 = sinon.stub().rejects(disposeError1)
            const dispose2 = sinon.stub()
            const dispose3 = sinon.stub().rejects(disposeError3)

            await resources.add(() => 1, dispose1)
            await resources.add(() => 2, dispose2)
            await resources.add(() => 3, dispose3)

            try {

                await resources.close()

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err, disposeError3)
                assert.strictEqual(err.other.length, 1)
                assert.strictEqual(err.other[0], disposeError1)

                assert.deepStrictEqual(dispose3.args, [ [ 3 ] ])
                assert.deepStrictEqual(dispose2.args, [ [ 2 ] ])
                assert.deepStrictEqual(dispose1.args, [ [ 1 ] ])
            }
        })

        it('properly closes resources before all of them are registered',
            async function () {

            const initErr = new Error('Init error.')

            const init1 = sinon.stub().resolves(timeout(100, 1))
            const init2 = sinon.stub().callsFake(async function () {
                await timeout(50)
                throw initErr
            })
            const init3 = sinon.stub().resolves(3)
            const init4 = sinon.stub().resolves(4)
            const dispose = sinon.stub()

            resources.add(init1, dispose)
            const error = resources.add(init2, dispose)
            resources.add(init3, dispose)
            resources.close()
            resources.add(init4, dispose)

            try {

                await error

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err, initErr)
                assert.deepStrictEqual(dispose.args, [ [ 1 ], [ 3 ] ])
                assert(init4.notCalled)
            }
        })
    })
})

function timeout (ms, data) {
    return new Promise(function (resolve) {
        setTimeout(() => resolve(data), ms)
    })
}
