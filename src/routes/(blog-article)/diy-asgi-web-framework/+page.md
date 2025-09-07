---
slug: diy-asgi-web-framework
title: Understanding and Creating your Own ASGI Web Framework
date: 2025-09-09T21:55:21.800Z
excerpt: How does a python async web framework is under the hood and how to implement it your own
coverImage: /images/posts/project-structure.jpg
tags:
  - ASGI
  - Web Framework
  - Python
  - WSGI
  - Uvicorn
  - Gunicorn
---

<script>
  import CodeBlock from "$lib/components/molecules/CodeBlock.svelte";
</script>

## Let's clarify a few things

### WSGI and ASGI
WSGI and ASGI are python specs for building web servers, *WSGI* for synchronous server and *ASGI* for asynchronous server
some famous implementation are [Gunicorn](https://docs.gunicorn.org) the most mature at this point which is designed to handle *WSGI* but due to its flexibility using
[WORKERS CLASS](https://docs.gunicorn.org/en/stable/settings.html#worker-class) to interface with web frameworks you can also run *ASGI* with it, and of course we have *ASGI* native implementation as [Uvicorn](https://www.uvicorn.org)
which server the same purposes of *Gunicorn* but with asynchronous focus.

Keeping all the sync and async stuff aside, some of the main features that these web servers handle are:

<CodeBlock lang="md">

```md
> O.S interface
---> Signal handling - Respond to OS signals (SIGTERM, SIGHUP, etc.) for control operations
---> File descriptor management - Efficiently handle large numbers of open connections
> Network interface
---> Socket binding - Bind to specific IP addresses and ports
---> TCP/UDP support - Handle different transport protocols
> Process Management
---> Workers lifecycle, Spawn process and/or threads to run the web application
```

</CodeBlock>

### Web Frameworks

Frameworks like flask, fastapi or any other wsgi/asgi based frameworks has a couple of main tasks to handle as:

<CodeBlock lang="md">

```md
> When a request arrives:
---> it must make sure we will send it to the correct handler
---> it must make sure we only receive methods that we have mapped [GET, POST, etc...]
---> it must allow you have access to headers
---> it must allow you have access to query string
---> it must allow you have access to body data
> When a request is completed
---> Make sure we are sending the response to the client with the data we need
---> Repassing status code, headers, payloads and etc
```

</CodeBlock>

These mentioned tasks are the very basic, if you want to know everything in detail I suggest you read the [WSGI](https://wsgi.readthedocs.io/en/latest/specifications.html), [ASGI](https://asgi.readthedocs.io/en/stable/specs/main.html) specs and 
take one framework you like and read its source code.

My recommendations: [AioHTTP](https://github.com/aio-libs/aiohttp)  #ASGI,  [Starlette](https://github.com/Kludex/starlette)  #ASGI,  [Flask](https://github.com/pallets/flask/)  #WSGI

## Building your own ASGI web framework

### Basic structure of an ASGI interface

In order to start to complaint with the *ASGI* specification, we will need to create the following code

<CodeBlock lang="python" filename="app.py">

```python

class App:
    
    # Every time a request comes to the server, the server will call the __call__ method of the class
    # The __call__ method is the entry point of the application
    async def __call__(self, scope, receive, send) -> None:
        # scope - as described in the ASGI spec it holds the request information as path, query strings, headers etc... in this case a dict var
        # receive - its an async generator that yields the request body
        # send - its an async function that sends the response back to the client
        pass

app = App()
# install uvicorn `pip install uvicorn`
```

</CodeBlock>

With this code we already have the basic structure required to start our work, and see the results.
We can now test by running the server with the following command: `uvicorn app:app`

This command will start a web server that will listen to the port 8000, then you can test it by opening your browser and going to `http://localhost:8000`
the request will be sent to the `app` but since in the call method we have not implemented anything yet, the uvicorn will detect it as an error because we did not answer the request, and then it will return a 500 internal error.

### Handling requests

In a real world framework we would normally have a way to register our routes within our handlers

Before we get into it, I want to explain how production frameworks normally do it.
*The following explanation simplifies as much possible to make it easy to understand and pass the idea, the actual implementation has much more complexity*

Let's start with the most common approach in python which uses a schema using list and/or Map to register its paths and then when a request arrives it tries to match the incoming request path with an item within it's items using regex.
E.g: [Flask](https://github.com/pallets/flask), [FastAPI](https://fastapi.tiangolo.com).

In the other side, not really famous in python for routing is using [radix-tree](https://en.wikipedia.org/wiki/Radix_tree), which is basically a tree like data structure, great for compressed text representation and for finding text values
because it instead of saving entire paths/strings, it deals with it as fragments so, a route like this /orders/user_ID/pending will be translated to store like this:

<CodeBlock lang="md">

```md
/ (root)
- > orders
  - > user_ID
    - > pending 
```

</CodeBlock>

which allow us to re-use its nodes for similar paths, for example, considering the previous route where we could have multiples routes changing only the last segment of this path, and it will live within the same node level, 
without the need to remake the struct for all segments again.

For comparison’s sake, in the previous option you would normally have the full path every time.
[Radix tree](https://en.wikipedia.org/wiki/Radix_tree) is powerful, worth its own blog post.


In our case we will use a `radix-tree`, but in a sort of basic format because we don't need the full code of it.
We will have only `Add` and `Get` method which is everything we will need for now.

*!Yep*, for a web framework either use lists or radix tree to store and match routes you could use anything you want that will be fine, unless you were planning to server hundreds thousands of routes in one single application, which I hope you aren't...

*!Yep*, for the example we could use a list or dict, but I want to evolve this sample in the coming blog posts

### Coding our Initial Router

<CodeBlock lang="python" filename="router.py">

```python
from dataclasses import dataclass
from typing import Any, List, Union, Dict

# this will represent our endpoint/route
@dataclass
class _Route:
    handler: Any
    path: str

# this will make the magic of association between path similarities
class _NodeRoute:
    """
    Visual example
    routes
     -> / -> home handler
     -> /users -> users handler
     -> /files/documents -> documents handler

    root [segment = /, children = Users, Files, handler = home/index handler]

        -> users [segment = users, children = ..., handler =  users handler]

        -> files [segment = files, children = documents, handler =  None]
            -> documents [segment = documents, children = ..., handler =  documents handler]
    ...
    and that continue as required, allowing to add more items and nesting as required
    """
    __slots__ = ["segment", "children", "handler"]

    def __init__(self, segment: str = ""):
        self.segment: str = segment  # the part of the route we will have
        self.children: Dict[str, _NodeRoute] = {}  # dict segment and its node route
        self.handler: Any = None  # the handler if exists

    def __repr__(self) -> str:
        return f"NodeRoute({self.segment}) children = {len(self.children)}"


# this will be the interface with our users
class Router:
    __slots__ = ["root"]

    def __init__(self):
        self.root = _NodeRoute()

    @staticmethod
    def get_segments(path: str) -> List[str]:
        return path.split("/")

    def add_route(self, path: str, handler: Any) -> None:
        current = self.root
        segments = self.get_segments(path)
        # insertion DFS like
        for segment in segments:
            if segment not in current.children:
                current.children[segment] = _NodeRoute(segment)

            # swp to the next nest level
            current = current.children[segment]

        current.handler = handler

    def get_route(self, path: str) -> Union[_NodeRoute, None]:
        current = self.root
        segments = self.get_segments(path)
        for segment in segments:
            if segment not in current.children:
                # print("not found")
                return None

            current = current.children[segment]

        return current
```

</CodeBlock>