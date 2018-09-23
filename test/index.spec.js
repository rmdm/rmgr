const assert = require('assert-match')
const sinon = require('sinon')

const Resources = require('../index')

describe('resource manager', function () {

    let resources

    beforeEach(function () {
        resources = Resources()
    })

    describe('add method', function () {

        it('returns object created by the initializer', async function () {

            const o = {}

            const init = sinon.stub().resolves(o)

            const result = await resources.add(init, sinon.stub())

            assert.strictEqual(result, o)
        })

        it('calls dispose methods added for all previously added resources '
            + 'when init fails', async function () {

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
                assert.deepStrictEqual(dispose.args, [
                    [ 3 ],
                    [ 2 ],
                    [ 1 ],
                ])
            }
        })

        it('throws when closed', async function () {

            await resources.close()

            try {

                await resources.add(sinon.stub())

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err.message, 'rmgr instance already closed.')
            }
        })

        it('throws when added dispose method is not a function',
            async function () {

            try {

                await resources.add(sinon.stub())

                throw new Error('Should not be called.')

            } catch (err) {
                assert.strictEqual(err.message, 'dispose must be a function.')
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
                assert.strictEqual(err.other.length, 1)
                assert.strictEqual(err.other[0].other.length, 1)
                assert.strictEqual(err.other[0], disposeError3)
                assert.strictEqual(err.other[0].other[0], disposeError1)

                assert.deepStrictEqual(dispose3.args, [ [ 3 ] ])
                assert.deepStrictEqual(dispose2.args, [ [ 2 ] ])
                assert.deepStrictEqual(dispose1.args, [ [ 1 ] ])
            }
        })

    })

    describe('close method', function () {

        it('calls registered dispose methods in the revers order of addition',
            async function () {

            const dispose = sinon.stub()

            await resources.add(() => 1, dispose)
            await resources.add(() => 2, dispose)
            await resources.add(() => 3, dispose)

            await resources.close()

            assert.deepStrictEqual(dispose.args, [
                [ 3 ],
                [ 2 ],
                [ 1 ],
            ])
        })

        it('does its best to call all registered disposes even if some of them '
            + 'throws and returns initial error', async function () {

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
    })
})
