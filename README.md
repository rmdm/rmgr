rmgr [![Build Status](https://travis-ci.org/rmdm/rmgr.svg?branch=master)](https://travis-ci.org/rmdm/rmgr) [![Coverage Status](https://coveralls.io/repos/github/rmdm/rmgr/badge.svg?branch=master)](https://coveralls.io/github/rmdm/rmgr?branch=master)
====

Helps to release resources gracefully.

Install
=======

```sh
npm i --save rmgr
```

Usage example
=============

**rmgr** exposes a factory function that creates an **rmgr** instance.
For each resource you register its `initialize` and `dispose` functions with the instance's `add` method.
Then, whenever you need to release the resources you just call `close` method:

```javascript
const rmgr = require('rmgr')

const { MongoClient } = require('mongodb')
const Redis = require('ioredis')
const express = require('express')

const resources = rmgr()

/*
    In case of one of the following resources initialization failure,
    the app shutdowns gracefully (i.e. closes all already inited resources)
    before reporting the error.
*/

try {

    const mongoClient = await resources.add(
        () => MongoClient.connect('mongodb://localhost'),
        mongoClient => mongoClient.close()
    )

    const redis = await resources.add(
        (cb) => {
            const redis = new Redis({ retryStrategy: () => false })
            redis.once('error', cb)
            redis.once('connect', function () {
                redis.removeListener('error', cb)
                cb(null, redis)
            })
        },
        (redis, cb) => redis.quit(cb)
    )

    const server = await resources.add(
        (cb) => {
            const server = express().listen(0)
            server.once('error', cb)
            server.once('listening', function () {
                server.removeListener('error', cb)
                cb(null, server)
            })
        },
        // throw timeout error, if not closed within a minute
        rmgr.timeout((server, cb) => server.close(cb), 60000)
    )

    // ... now, you can use the initialized resources ...

} catch (err) {

    // An initialization error occured, just print it.
    // All opened resources are closed and the app is about to exit gracefully.

    console.error(err)
}

process.on('SIGINT', async function () {
    try {
        await resources.close()
    } catch (err) {
        console.error(err)
        process.exit(1) // We've done our best.
    }
})
```

The problem
===========

This section describes the problem the module solves.

It's tedious to set up graceful resource handling properly. Especially when there are several resources to manage.
Some of the resources may fail on initialization step and then all already initialized ones have to be teared down properly. Handling all this in a graceful way without a special helper leads to a messy cluttered code that gets worse with every single resource added:

```javascript

// With try-catch for every resource

const resourceA = await initResourceA()

try {

    const resourceB = await initResourceB()

    try {

        const resourceC = await initResourceC()

        try {

            // ... and so on

        } catch (err) {

            await close(resourceC)
        }

    } catch (err) {

        await close(resourceB)
    }

} catch (err) {

    await close(resourceA)
}

// With "if-inited" for every resource

let resourceA, resourceB, resourceC

try {

    resourceA = await initResourceA()
    resourceB = await initResourceB()
    resourceC = await initResourceC()

} catch (err) {

    if (resourceC) {
        await close(resourceC)
    }

    if (resourceB) {
        await close(resourceB)
    }

    if (resourceA) {
        await close(resourceA)
    }
}
```

**rmgr** helps to handle this in an easy-to-use, reliable and concise way:

```javascript

const resources = rmgr()

const resourceA = await resources.add(
    () => initResourceA(),
    resourceA => close(resourceA)
)

const resourceB = await resources.add(
    () => initResourceB(),
    resourceB => close(resourceB)
)

const resourceC = await resources.add(
    () => initResourceC(),
    resourceC => close(resourceC)
)

// yes, with **rmgr** try-catch is not required to close all the resources
// in a graceful way (it may only be needed to catch an initialization error)
```

API
===

### `rmgr () => resources`

A factory function that initializes an **rmgr** instance.

### `resources.add (initialize, dispose) => Promise`

Awaits `initialize` function to resolve, and returns its result. `dispose` is called either when `resources.close` is called, or when one of consequent `resources.add`'s `initialize` function is thrown. Both `initialize` and `dispose` functions support both callbacks and promises. To use the callback you need to add corresponding parameter to the required `initialize` or `dispose` function.

##### `initialize ([cb])`

It is expected to resolve a resource that later will be disposed. When `cb` param is specified, the function is called with the ordinary node-style callback of signature `(err, resource)`.

##### `dispose (resource, [cb])`

Should dispose previously initialized `resource`. When `cb` param is specified, the function is called with a node-style callback of signature `(err)`.

### `resources.close () => Promise`

Closes all the registered resources by calling corresponding `dispose` functions in the reverse order of initialization. All consequent `resources.add` and `resources.close` calls are ignored.

### `rmgr.timeout(fn, ms) => Promise`

Many resources include timeouts handling, but some are not. For such cases **rmgr** provides `timeout` wrapper for corresponding `initialize` and `dispose` functions. It throws `rmgr.TimeoutError`, if specified `fn` function is not resolved within `ms` milliseconds. The `fn` function allows using both callbacks and promises.

##### `fn ([resource], [cb])`

`fn` is just an `initialize` or `dispose` function to wrap. The way they are called is the same as without the wrapping, see [details](#initialize-cb).

### `rmgr.TimeoutError`

Instances of the `TimeoutError` are thrown by `rmgr.timeout` when the timeout is expired.

### `rmgr.using(PromiseLib) => rmgr`

Returns **rmgr** factory function that uses specified `PromiseLib`.

Miscellaneous
=============

### on `process.exit`

`process.exit` is a hard way to close your app, which may have unforeseen side effects on your resources, so, use it as the last resort. It still has its use even with **rmgr** but it's well defined. You should always call `process.exit` in the following two cases:

- when `rmdm.close` is rejected with an error (see [the usage example](#usage-example)),
- or, in case you are using `rmgr.timeout`, when `resources.add` is rejected with a `rmgr.TimeoutError`.

### What to count as a resource?

A rule of a thumb is that you would add to **rmgr** everything that will prevent your process from exiting.

### Combining several **rmgr**s

**rmgr**s can be combined, though it should be rarely needed:

```javascript
const Resources = require('rmrg')

const subresources = Resources()
const otherSubresources = Resources()
const resourcesRoot = Resources()

subresources.add(/* */)
otherSubresources.add(/* */)

resourcesRoot.add(
    () => subresources,
    subresources => subresources.close()
)

resourcesRoot.add(
    () => otherSubresources,
    otherSubresources => otherSubresources.close()
)

await resourcesRoot.close() // close all the resources from all rmgrs
```
