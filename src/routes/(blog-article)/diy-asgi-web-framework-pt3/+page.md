---
slug: diy-asgi-web-framework-pt3
title: Understanding and Creating your Own ASGI Web Framework [Part-3]
date: 2025-09-12T00:00:21.800Z
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

### Let's recap what we did in the previous part

In my [Second Article](/diy-asgi-web-framework-pt2) we have improved our framework a little bit, and we end up with the following items:

<CodeBlock lang="md"> 

```md
---> app.py - Implementing the basics of the ASGI interface
---> router.py - Router implementation that handles the routing storage and matching - with a lot of room for improvement
---> api_router.py - Contain the router class that we can use to add multiple instances of it to the app
---> types.py - Contain a few types used in the framework
---> request_data.py - Contain a really draft structure of how we could pass request data to handlers
```

</CodeBlock>

## So, what's next?

Well, we have a lot of things to improve and/or implement, from router improvements, handler final structure definition, add some helpers for pre-defined http responses, status codes, etc...

Let's start creating a few helpers to make our life easier in the next parts.

### Defining helpers

I have created a few http responses that can either be used as it is or extended to add more of them in the future.
<CodeBlock lang="python" filename="asgi/http_responses.py">

```python
import json
from dataclasses import dataclass
from typing import Any, Optional, Tuple, List

from asgi.types import StatusCode


@dataclass
class _ResponseData:
    status_code: StatusCode
    body: bytes
    headers: list[tuple[bytes, bytes]]

class BaseHTTPResponse:

    def __init__(self, body: Any, status_code: StatusCode = StatusCode.OK, headers: Optional[dict] = None, encode: str = "utf-8"):
        if headers is None:
            headers = {}
        assert isinstance(headers, dict), "headers must be a dict"
        assert isinstance(status_code, StatusCode) or isinstance(status_code, int), "status_code must be a StatusCode enum or int"
        assert isinstance(encode, str), "encode must be a string"

        self._status_code = status_code
        self._headers = headers
        self._body = body
        self._encode = encode

    def __repr__(self):
        return f"<BaseHTTPResponse status_code={self._status_code}>"

    def get_headers(self) -> dict:
        return self._headers

    def get_status_code(self) -> StatusCode:
        return self._status_code

    def _get_bytes_headers(self) -> List[Tuple[bytes, bytes]]:
        headers = []
        for key, value in self._headers.items():
            headers.append((key.encode(self._encode), value.encode(self._encode)))

        return headers

    def add_header(self, key: str, value: str) -> None:
        self._headers[key] = value

    def get_body(self) -> bytes:
        raise NotImplementedError("get_body method is not implemented yet")

    async def __call__(self) -> _ResponseData:
        await self._set_body_length()
        headers = self._get_bytes_headers()

        return _ResponseData(self._status_code, self.get_body(), headers)

    async def _set_body_length(self):
        body_length = len(self.get_body())
        self._headers["content-length"] = str(body_length)


class TextResponse(BaseHTTPResponse):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._headers["content-type"] = "text/plain"

    def get_body(self) -> bytes:
        if not self._body:
            return b""
        return self._body.encode(self._encode)

class JsonResponse(BaseHTTPResponse):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._headers["content-type"] = "application/json"

    def get_body(self) -> bytes:
        if not self._body:
            return b""
        return json.dumps(self._body).encode(self._encode)

def NOT_FOUND_JSONResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> JsonResponse:
    return JsonResponse(body, StatusCode.NOT_FOUND, headers, encode)

def BAD_REQUEST_JSONResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> JsonResponse:
    return JsonResponse(body, StatusCode.BAD_REQUEST, headers, encode)

def INTERNAL_SERVER_ERROR_JSONResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> JsonResponse:
    return JsonResponse(body, StatusCode.INTERNAL_SERVER_ERROR, headers, encode)

def OK_JSONResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> JsonResponse:
    return JsonResponse(body, StatusCode.OK, headers, encode)

def NOT_FOUND_TEXTResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> TextResponse:
    return TextResponse(body, StatusCode.NOT_FOUND, headers, encode)

def BAD_REQUEST_TEXTResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> TextResponse:
    return TextResponse(body, StatusCode.BAD_REQUEST, headers, encode)

def METHOD_NOT_ALLOWED_TEXTResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> TextResponse:
    return TextResponse(body, StatusCode.METHOD_NOT_ALLOWED, headers, encode)

def INTERNAL_SERVER_ERROR_TEXTResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> TextResponse:
    return TextResponse(body, StatusCode.INTERNAL_SERVER_ERROR, headers, encode)

def OK_TEXTResponse(body: Any = None, headers: Optional[dict] = None, encode: str = "utf-8") -> TextResponse:
    return TextResponse(body, StatusCode.OK, headers, encode)
```

</CodeBlock>


We will need some custom exceptions to handle some errors that can happen either in our framework or in the user code.

The following code design will allow us to either use the builtin exceptions or our custom ones with TEXT or JSON-based responses.

<CodeBlock lang="python" filename="asgi/exceptions.py">

```python
from asgi.http_responses import (
    BAD_REQUEST_TEXTResponse,
    NOT_FOUND_TEXTResponse,
    METHOD_NOT_ALLOWED_TEXTResponse,
    BaseHTTPResponse,
)

class InvalidRequest(Exception):
    def __init__(self):
        super().__init__()
        self.http_response: BaseHTTPResponse = None # just to help with type hinting

class InvalidRequestDataException(InvalidRequest):
    def __init__(self, message: str):
        super().__init__()
        self.http_response = BAD_REQUEST_TEXTResponse(message)

class NotFoundException(InvalidRequest):
    def __init__(self, message: str = "Not found"):
        super().__init__()
        self.status_code = NOT_FOUND_TEXTResponse(message)

class MethodNotAllowedException(InvalidRequest):
    def __init__(self, message: str = "Method not allowed"):
        super().__init__()
        self.status_code = METHOD_NOT_ALLOWED_TEXTResponse(message)
```

</CodeBlock>

And finally, we have a small update to our types. It is now holding types and constants that are also types, but for now I think that's fine.
We can always improve if we need to.

<CodeBlock lang="python" filename="asgi/types.py">

```python
from enum import Enum
from typing import Callable, TypeVar, Optional

BODY_TYPE = TypeVar('BODY_TYPE')
QUERY_STRING_TYPE = TypeVar('QUERY_STRING_TYPE')
HandlerType = Callable[['RequestData[QUERY_STRING_TYPE, BODY_TYPE]'], 'BaseHTTPResponse'] # add a response to our handler type
QueryExtractor = Optional[Callable[[dict], QUERY_STRING_TYPE]]
BodyExtractor = Optional[Callable[[bytes], BODY_TYPE]]

class Methods(Enum):
    GET = 'GET'
    POST = 'POST'
    PUT = 'PUT'
    PATCH = 'PATCH'
    DELETE = 'DELETE'


class StatusCode:
    OK = 200
    BAD_REQUEST = 400
    NOT_FOUND = 404
    METHOD_NOT_ALLOWED = 405
    INTERNAL_SERVER_ERROR = 500
```

</CodeBlock>

Well, we have a lot of helpers items defined. Even though that's not all we will need to complete our framework but that's all we need for now.

### Improving our router

In the previous versions of our router we have a few issues related to path segmentation, where a few cases are not handled properly.

For exemple in "/"(root) It will store the route as an empty string, trailing slash will be adding an empty ending to the path, and I also have missed a few validations, so let's fix it.

<CodeBlock lang="python" filename="asgi/router.py">

```python

#most of the previous code will be ommited since it's not relevant or changed in this version

# refac of the get_segments method
@staticmethod
def get_segments(path: str) -> List[str]:
    if path == "" or path == "/":
        return ["/"]
    return ["/"] + [seg for seg in path.split("/") if seg]

# add route method got a new validation for method
def add_route(
        # params...
) -> None:
    assert method in Methods, f"Method {method} not supported"

    # same as before...


# get route method got two new behaviours
def get_route(self, path: str, method: Methods) -> Optional[_Route]:
    assert method in Methods, f"Method {method} not supported" # is now validating method

    # same as before...

    # method not allowed
    if current.routes[Methods(method)] is None: # when detected method is not allowed it raises an exception
        raise MethodNotAllowedException(f"Method {method} not allowed on path {path}")

    return current.routes[Methods(method)]
```

</CodeBlock>

The router still has a lot of room for improvements, but we have a structure that has everything we need for this step. Let's move on to the next part.

### Improving our App class

I think the App class is probably the most draft part at this point, we have a lot of things to implement in it...

At the same time, most of the things we have not implemented yet will be better explained with a dedicated part for it to make the understanding and learning process easier.

Anyway, Let's jump to what we have now, which is basically an improved structure where we have almost complete http handling, which translates to:
- route handling
- request data handling
- response handling
- exception handling

<CodeBlock lang="python" filename="asgi/app.py">

```python
from typing import List, Dict, Any, Callable, Awaitable


from asgi.exceptions import InvalidRequest
from asgi.http_responses import (
    NOT_FOUND_TEXTResponse,
    INTERNAL_SERVER_ERROR_TEXTResponse,
    BaseHTTPResponse,
    _ResponseData
)
from asgi.request_data import RequestData
from asgi.router import Router
from asgi.api_router import ApiRouter


# ASGI type aliases
ASGIScope = Dict[str, Any]
ASGIReceive = Callable[[], Awaitable[Dict[str, Any]]]
ASGISend = Callable[[Dict[str, Any]], Awaitable[None]]


class App:

    def __init__(self):
        self.router = None

    def include_routes(self, routes: List[ApiRouter]) -> None:
        """
        This method will add all registered routes to the application router.
        It should be called at the application startup.
        Call it twice will raise an error.

        e.g:
        # pkg1
        router_1 = ApiRouter()
        @router_1.get("/home")
        async def home(request_data):
            print("home triggered")

        @router_1.get("/")
        async def root(request_data):
            print("root triggered")

        # pkg2
        router_2 = ApiRouter()
        @router_2.get("/about")
        async def about(request_data):
            print("about triggered")

        app = App()
        app.include_routes([router_1, router_2])

        """
        assert self.router is None, "include_routes method can be called only once"

        self.router = Router()

        route_list = []
        for router_items in routes:
            route_list += router_items.routes

        sorted_routes = sorted(route_list, key=lambda x: x[0])
        for route in sorted_routes:
            self.router.add_route(*route)

    async def __call__(self, scope: ASGIScope, receive: ASGIReceive, send: ASGISend):
        if scope['type'] == 'http':
            return await self._handle_http_request(scope, receive, send)

        # we will deal with other types later

    async def _handle_http_request(self, scope: ASGIScope, receive: ASGIReceive, send: ASGISend):
        ''' payload ref
        scope = {
            'type': 'http',
            'asgi': {'version': '3.0', 'spec_version': '2.3'},
            'http_version': '1.1', 'server': ('127.0.0.1', 8000),
            'client': ('127.0.0.1', 51945), 'scheme': 'http',
            'method': 'GET', 'root_path': '',
            'path': '/some-path/', 'raw_path': b'/some-path/',
            'query_string': b'qs1=1&qs2=opa!',
            'headers': [
                (b'user-agent', b'PostmanRuntime/7.45.0'),
                (b'accept', b'*/*'),
                (b'postman-token', b'1111f6f3-1111-1111-1111-37150dd41111'),
                (b'host', b'localhost:8000'),
                (b'accept-encoding', b'gzip, deflate, br'),
                (b'connection', b'keep-alive')
            ],
            'state': {}
        }
        '''
        assert scope['type'] == 'http'
        response_data = await self._run_http_handler(scope['path'], scope['method'], receive)
        await self._send_http_response(response_data, send)

    async def _run_http_handler(self, path: str, method: str, receive: ASGIReceive) -> _ResponseData:
        try:
            target = self.router.get_route(path, method)
            if target is None:
                return await NOT_FOUND_TEXTResponse()()

            request_data = RequestData(receive, target.query_string_extractor, target.body_extractor)
            response = await target.handler(request_data)
            if response is not isinstance(response, BaseHTTPResponse):
                print('handler returned a non valid response. Response must be an instance of BaseHTTPResponse')
                return await INTERNAL_SERVER_ERROR_TEXTResponse()()

            return await response()

        except InvalidRequest as e:
             return await e.http_response()

        except Exception as e:
            print('error' + str(e))
            return await INTERNAL_SERVER_ERROR_TEXTResponse()()

    @staticmethod
    async def _send_http_response(resp: _ResponseData, send: ASGISend):
        await send({
            "type": "http.response.start",
            "status": resp.status_code,
            "headers": resp.headers
        })

        await send({
            "type": "http.response.body",
            "body": resp.body
        })
```

</CodeBlock>

And that's it!
In summary, we have a working framework that can handle multiple routes, multiple methods, transmit body data, allow custom exceptions, has support for both json and text responses.
*Do not panic with my prints there :) we will add a proper logging handling later*

You may not use it in production, but at least you have a great idea of how the basics of a web framework work.

Time to play with it!
You can use the code below to test it.

<CodeBlock lang="python" filename="sample.py">

```python
from asgi.app import App
from asgi.api_router import ApiRouter
from asgi.http_responses import OK_JSONResponse
from asgi.request_data import RequestData
from asgi.types import Methods

router1 = ApiRouter()

@router1.get("/home")
async def home(request_data):
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
    qs = await request_data.get_query_string_params()
    body_stream = bytearray(*[ch async for ch in request_data.get_stream_body_bytes()])
    print(body_stream)
    body_custom = await request_data.get_body()
    print(body_custom)
    body_json = await request_data.get_json_body()
    print(body_json)

    return OK_JSONResponse()


app = App()
app.include_routes([router1, router2])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

</CodeBlock>

You can test it with `python sample.py` or `uvicorn sample:app` both should work just fine.

That's all for now!

*[!Source Code!](https://github.com/teod-sh/diy_asgi_framework)*

*[Link for Part-2!](/diy-asgi-web-framework-pt2)*

*[Link for Part-4!](/diy-asgi-web-framework-pt4)*

Thank you for reading! I hope you learned a little bit. If you have any complaint or want to talk please, drop me a message on LinkedIn!