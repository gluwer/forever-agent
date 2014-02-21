forever-agent
=============

HTTP Agent that keeps socket connections alive between keep-alive requests. Formerly part of mikeal/request, now a standalone module.

## Changes as v0.6

Version modified to support `maxKeepAliveTime` option and close socet after *n* miliseconds of inactivity. When value is other that 0, `minSockets` is not obeyed.
In addition `useChunkedEncodingByDefault` check was turned off.
