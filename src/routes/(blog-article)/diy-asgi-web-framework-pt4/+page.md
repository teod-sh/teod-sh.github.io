---
slug: diy-asgi-web-framework-pt4
title: Understanding and Creating your Own ASGI Web Framework [Part-4]
date: 2025-09-07T00:00:21.800Z
excerpt: Improving our ASGI framework Interface
coverImage: /images/posts/koala_python.png
tags:
  - ASGI
  - Web Framework
  - Python
  - WSGI
  - Uvicorn
  - Gunicorn
  - DIY
---

<script>
  import CodeBlock from "$lib/components/molecules/CodeBlock.svelte";
</script>
## Improving our ASGI framework

### Let's recap what we did in the previous part

In my [Third Article](/diy-asgi-web-framework-pt3) TODO-TODO

<CodeBlock lang="md"> 

```md
TODO-TODO
```

</CodeBlock>

## So, what's next?

Today we will add support for some features, handling all the events that the ASGI server provides to our application.

### ASGI Events

In my [First Article](/diy-asgi-web-framework) I have shown only one event type, the HTTP request event, but there are a few more that we can handle in our framework.

Events are triggered internally by the ASGI server(uvicorn, hypercorn,...). All of them are sent the same way we saw for the HTTP event, server will call our application passing the payload with that event.

Some events are triggered every request, as we saw in the HTTP event, and that also occurs for websocket. But there are events that are triggered once as we have for 'on startup' and 'on shutdown' events, which are triggered within a lifespan cycle.
Those differences are because they are distinct protocols/events.

Ok, this may seem a bit confusing at first, but I'll try to clarify it as much as possible.

*Request-based events* are triggered every time a request arrives, either for HTTP or websocket. Which translates to the following flow:

<CodeBlock lang="markdown">


```md
Client Request -> Web Server Handles it -> Web Server Call our application -> Our Application handles it using the __call__ method (Entry Point)
```

</CodeBlock>

Now, on the other side, *lifespan events* are triggered in a different way, it starts on our application startup and lives until the server calls for shutdown.

<CodeBlock lang="markdown">


```md
Server starts -> Server send lifespan event to App -> App handles it using the __call__ method (Entry Point)
At this point you can either "while true" because the server will allow your function runs until the server needs to shut down, or you can just return and do nothing.


If you have decided to handle the lifespan, you will have two events to handle within the lifespan cycle:
- lifespan.startup (this one indicates that the server is starting up)
- lifespan.shutdown (this one indicates that the server is shutting down)
```

</CodeBlock>

What do I mean by "while true"? It means that your function will be triggered once, but you are allowed to keep it running until you want, because at the end it will multitask with the async loop.

<CodeBlock lang="python" filename="lifespan_sample.py">


```python
# this is not a real implementation but hope it helps a little bit

# application start
lifespan_task = asyncio.create_task(app("passsing event lifespan + receiver method"))
# send data to receiver with event startup

# this is the main loop, which runs inside the Web server(uvicorn, hypercorn,...)
while True:
    
    # loop work doing stuff
    ...

# loop end
# send data to receiver with event shutdown
await lifespan_task
```

</CodeBlock>


On lifespan events loop, you can do whatever you want, a few common things frameworks do are:
- create/destroy instances of some class that will be used by the application
- allow users to trigger whatever they want to, like a database connection/disconnection
- gracefully shutdown the server
- handles background tasks triggering
etc...



<CodeBlock lang="python" filename="asgi/http_responses.py">

```python

```

</CodeBlock>




You can it with `python sample.py` or `uvicorn sample:app` both should work just fine.

That's all for now!

*[!Source Code!](https://github.com/teod-sh/diy_asgi_framework)*

*[Link for Part-2!](/diy-asgi-web-framework-pt2)*

*Link for Part-4 will be here when ready!*

Thank you for reading! I hope you learned a little bit. If you have any complaint or want to talk please, drop me a message on LinkedIn!