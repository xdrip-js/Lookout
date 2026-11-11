// Where a new glucose value is sent, given the rig options.

// The local OpenAPS xDripAPS server (127.0.0.1:5000). A Lookout-only rig has
// none, and every post fails with ECONNREFUSED; --no_xdripaps skips it.
const postToLocalXdrip = (options, requested) => Boolean(requested) && options.xdripaps !== false;

module.exports = { postToLocalXdrip };
