---
slug: diy-asgi-web-framework-pt5
title: Understanding and Creating your Own ASGI Web Framework [Part-5]
date: 2025-09-18T00:00:21.800Z
excerpt: Improving our ASGI framework
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

In the last part we have made a lot of progress implementing a background task system. And today we have a few more items to implement.

I have planned to implement a middleware system and also support for headers and query string, since it until now was just basically a placeholder.

Before we start, lets just make a few notes here for the middleware system and also the headers and query string support.

Middlewares:
- Must be for global usage, to support middlewares like CSRF, Cookies etc.
- Must have a simple signature based on class inheritance.

Headers:
- Must handle the headers and provide a simple dict to access them.

Query string:
- Must be straightforward to use and support custom extractors as we did with the body.
- Must be able to parse the query string as a dict as default.

### Headers and Query string

The changes for headers were pretty straightforward, I have added a method to get the headers as a dict parsing it from bytes to string.

On the other side for the query string, Even I have added a simple method that you would normally avoid to it yourself it shows the idea behind the query string parsing.

<CodeBlock lang="python" filename="asgi/request_data.py">

```python
class RequestData(Generic[QUERY_STRING_TYPE, BODY_TYPE]):

    def __init__(
            self, asgi_receiver_method: Callable[[], Awaitable[Dict[str, Any]]],
            headers: List[Tuple[bytes, bytes]],
            query_string: bytes = b'',
            qs_extractor: QueryExtractor = None,
            body_extractor: BodyExtractor = None
    ):
        self._qs_extractor = qs_extractor
        self._body_extractor = body_extractor
        self._asgi_receiver_method = asgi_receiver_method

        self._body = b''
        self._headers = headers
        self._query_string = query_string
    
    async def get_headers(self) -> dict:
        return {key.decode("utf-8"): value.decode("utf-8") for key, value in self._headers}

    async def get_header_value(self, key: str) -> str:
        headers = await self.get_headers()
        return headers.get(key, "")

    async def get_query_string(self) -> Union[QUERY_STRING_TYPE, None]:
        """
        This method will trigger custom extractors registered withing the router
        The type of the returned value depends on the query_string_extractor used.

        If no extractor is registered, returns None.
        """
        if self._qs_extractor is None:
            return None
        return self._qs_extractor(self._query_string)

    async def get_query_string_dict(self) -> dict:
        """
        Parse the query string as Dict. Malformatted values will be ignored.

        !Important: it won't trigger custom extractors as query_string_extractor is not used

        !You would probably want to use either parse_qs or parse_qsl from the urllib.parse STD package,
        but I wanted to build it just to show the process of parsing it here.!
        """
        result = {}
        if not self._query_string:
            return result

        qs = self._query_string.replace(b'?', b'')
        for key_value_pair in qs.split(b'&'):
            infos = key_value_pair.split(b'=')
            if len(infos) != 2:
                # skip malformed values
                continue
            try:
                key = unquote_plus(infos[0].decode("utf-8"))
                value = unquote_plus(infos[1].decode("utf-8"))
                if key in result:
                    if not isinstance(result[key], list):
                        result[key] = [result[key]]
                    result[key].append(value)
                else:
                    result[key] = value
            except (UnicodeDecodeError, ValueError):
                continue  # Skip malformed values

        return result

    #ommited other methods
```

</CodeBlock>

### Adding a global middleware system

That's one of the most simple things I've done so far but delivers a lot of value.

This simple middleware system has a manager that when triggered will chain all the middlewares and call the handler respecting the middlewares insertion order.

It will be injected into the App class so when the App decides to trigger the handler, instead, we call the middleware manager passing the target handler and then starting the chaining process.

With this foundation you can have any global middleware you want and have as much of them as you want, or none at all that's up to you.

<CodeBlock lang="python" filename="asgi/middleware.py">

```python
from abc import ABC
from typing import List, Union

from asgi.types import HandlerType


class BaseGlobalMiddleware(ABC):
    """
    Base class for global middleware.
    You can implement your own global middleware by inheriting this class.

    e.g: CSRF, Cookie, Session middlewares... anything you want to run in a global scope.
    """

    async def __call__(self, call_next: Union['BaseGlobalMiddleware', HandlerType]):
        """
        e.g:
        async def __call__(self, call_next):
            async def wrapper(request_data):
                # do something...
                return await handler(request_data)

        return wrapper
        """
        raise NotImplementedError("__call__ method is not implemented yet")


class _MiddlewareManager:

    def __init__(self, middlewares: List[BaseGlobalMiddleware]):
        self.stack = middlewares

    async def wrap(self, handler: HandlerType, request_data):
        current_handler = handler

        for middleware in reversed(self.stack):
            current_handler = await middleware(current_handler)

        return await current_handler(request_data)

    async def __call__(self, handler, request_data):
        return await self.wrap(handler, request_data)
```

</CodeBlock>


### Testing our framework

Let's add a few middlewares to our sample and test it!

<CodeBlock lang="python" filename="sample.py">

```python
from asgi.app import App
from asgi.api_router import ApiRouter
from asgi.background_tasks import get_background_tasks, create_task
from asgi.http_responses import OK_JSONResponse
from asgi.middleware import BaseGlobalMiddleware
from asgi.request_data import RequestData
from asgi.types import Methods

router1 = ApiRouter()

async def home_bg_task(_) -> None:
    print("home bg task triggered")

@router1.get("/home")
async def home(request_data):
    bg_task = get_background_tasks()
    await bg_task.add_tasks([create_task(home_bg_task)])
    print("home triggered")

    return OK_JSONResponse()

@router1.get("/")
async def root(request_data):
    print("root triggered")
    return OK_JSONResponse()

router2 = ApiRouter()
@router2.get("/about")
async def about(request_data):
    print("about triggered")
    # server should return 500 error because we are returning none as response


def qs_extractor(qs: dict) -> dict:
    return qs

def body_extractor(body: bytes) -> int:
    return 1

@router2.multi_methods(
    "/about/careers",
    [Methods.GET, Methods.POST],
    qs_extractor,
    body_extractor
)
async def about(request_data: RequestData[dict, int]):
    print("about careers triggered")
    qs = await request_data.get_query_string_dict()
    print(qs)
    body_stream = bytearray(*[ch async for ch in request_data.get_stream_body_bytes()])
    print(body_stream)
    body_custom = await request_data.get_body()
    print(body_custom)
    body_json = await request_data.get_json_body()
    print(body_json)

    return OK_JSONResponse()

class Mid1(BaseGlobalMiddleware):

    async def __call__(self, handler):
        async def wrapper(request_data):
            print("mid1")
            resp = await handler(request_data)
            print("mid1 end")
            return resp

        return wrapper

class Mid2(BaseGlobalMiddleware):

    async def __call__(self, handler):
        async def wrapper(request_data):
            print("mid2")
            resp = await handler(request_data)
            print("mid2 end")
            return resp

        return wrapper


app = App(middlewares=[Mid1(), Mid2()])

app.include_routes([router1, router2])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```


</CodeBlock>


You can test it with `python sample.py` or `uvicorn sample:app` both should work just fine.

## Conclusion

So far, we have seen a lot about ASGI frameworks are under the hood. I hope at this point you have a better vision of it.

I'm saying ASGI, but in fact it's more like standard Web frameworks, you have learned the basis of them all.

You will see a lot of these inside known frameworks out there, of course, if they are in python will be closer to the examples, but the general idea you will see in any other language (Only the App/ASGI structure are Python specific).


## Thanks!

This is the last part of this ASGI series, I'll continue writing as frequently as possible, but it's time to move to another series, languages, tools...

I'll probably continue improving this framework, but I don't know when. So, let's see how it goes.

Thank you for reading! I truly hope you enjoyed it!
If you have any feedback, let's talk! If you loved it, please, share it with your friends, LinkedIn, and remember to **[give me a star!](https://github.com/teod-sh/diy_asgi_framework)**

**[!Source Code!](https://github.com/teod-sh/diy_asgi_framework)**

*[Link for Part-4!](/diy-asgi-web-framework-pt4)*