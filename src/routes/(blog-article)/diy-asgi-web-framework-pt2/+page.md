---
slug: diy-asgi-web-framework-pt2
title: Understanding and Creating your Own ASGI Web Framework [Part-2]
date: 2025-09-09T00:00:21.800Z
excerpt: How does a python async web framework is under the hood and how to implement it your own
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

### Before start let's recap what we did in the previous part

In my [First Article](/diy-asgi-web-framework) we have learned the basics of the ASGI application, coding our initial app class and a initial router class.

### So, what's next?

I have planned to improve our router and define at least a draft for how data flows through the application. 

Starting with the router part, if we want to have multiple methods for a single route, we have to change a few things and make sure it works as expected too.

<CodeBlock lang="python" filename="asgi/router.py">

```python
from dataclasses import dataclass
from typing import List, Dict, Optional

from asgi.types import HandlerType, Methods, QueryExtractor, BodyExtractor


@dataclass
class _Route:
    handler: HandlerType
    query_string_extractor: QueryExtractor
    body_extractor: BodyExtractor


class _NodeRoute:
    """
    ommited...
    """
    __slots__ = ["segment", "children", "routes"]

    def __init__(self, segment: str = ""):
        self.segment: str = segment
        self.children: Dict[str, '_NodeRoute'] = {}
        self.routes: Dict[Methods, Optional[_Route]] = {enum_value: None for enum_value in Methods}

    def __repr__(self) -> str:
        return f"NodeRoute({self.segment}) children = {len(self.children)}"


class Router:
    __slots__ = ["root"]

    def __init__(self):
        self.root = _NodeRoute()

    @staticmethod
    def get_segments(path: str) -> List[str]:
        return path.split("/")

    def add_route(
            self, 
            path: str, 
            handler: HandlerType, 
            method: Methods = Methods.GET,
            query_string_extractor: QueryExtractor = None,
            body_extractor: BodyExtractor = None,
    ) -> None:
        current = self.root
        segments = self.get_segments(path)
        # insertion DFS like
        for segment in segments:
            if segment not in current.children:
                current.children[segment] = _NodeRoute(segment)

            # swp to the next nest level
            current = current.children[segment]

        current.routes[method] = _Route(handler, query_string_extractor, body_extractor)

    def get_route(self, path: str, method: Methods) -> Optional[_Route]:
        current = self.root
        segments = self.get_segments(path)
        for segment in segments:
            if segment not in current.children:
                return None

            current = current.children[segment]

        # method not allowed
        if current.routes[Methods(method)] is None:
            return None
        return current.routes[Methods(method)]
```

</CodeBlock>

And also I have added a new class called ApiRouter to deal with bigger applications where you could add multiple instances of it
and then just pass it to the app class to register all the routes.

<CodeBlock lang="python" filename="asgi/api_router.py">

```python
from typing import List, Tuple, Callable

from asgi.types import HandlerType, Methods, QueryExtractor, BodyExtractor

RouteInfo = Tuple[str, HandlerType, Methods, QueryExtractor, BodyExtractor]
DecoratorReturn = Callable[[HandlerType], HandlerType]


class ApiRouter:
    ''' e.g:
    router1_pkg_sample_1 = ApiRouter()

    @router1_pkg_sample_1.get("/home")
    async def home(request_data):
        print("home triggered")
    
    router2_pkg_sample_2 = ApiRouter()
    @router2_pkg_sample_2.get("/about")
    async def about(request_data):
        print("about triggered")

    app = App()
    app.include_routes([router1_pkg_sample_1, router2_pkg_sample_2])
    '''
    __slots__ = ["routes"]
    
    def __init__(self):
        self.routes: List[RouteInfo] = []

    def decorator(
            self, 
            path: str,
            method: Methods,
            query_string_extractor: QueryExtractor = None,
            body_extractor: BodyExtractor = None
    ) -> DecoratorReturn:
        def wrap(handler: HandlerType) -> HandlerType:
            self.routes.append((path, handler, method, query_string_extractor, body_extractor))
            return handler
        return wrap
    
    # ...ommited all other methods because is the same as get with a different request method
    
    def get(
            self, 
            path: str,
            query_string_extractor: QueryExtractor = None,
            body_extractor: BodyExtractor = None
    ) -> DecoratorReturn:
        return self.decorator(path, Methods.GET, query_string_extractor, body_extractor)

    def multi_methods(
            self, 
            path: str,
            methods: List[Methods],
            query_string_extractor: QueryExtractor = None,
            body_extractor: BodyExtractor = None
    ) -> DecoratorReturn:
        def decorator(handler: HandlerType) -> HandlerType:
            for method in methods:
                self.routes.append((path, handler, method, query_string_extractor, body_extractor))
            return handler
        return decorator

```

</CodeBlock>

And last, I have also added a few changes to our App class so we can handle the previous modifications

<CodeBlock lang="python" filename="asgi/app.py">

```python
from typing import List

from asgi.request_data import RequestData
from asgi.router import Router
from asgi.api_router import ApiRouter


class App:

    def __init__(self):
        self.router = None

    def include_routes(self, routes: List[ApiRouter]) -> None:
        if self.router is not None:
            return

        self.router = Router()

        route_list = []
        for router_items in routes:
            route_list += router_items.routes

        sorted_routes = sorted(route_list, key=lambda x: x[0])
        for route in sorted_routes:
            self.router.add_route(*route)


    async def __call__(self, scope, receive, send):
        target = self.router.get_route(scope['path'], scope['method'])

        if target is None:
            await send({"type": "http.response.start", "status": 404})
            await send({"type": "http.response.body", "body": b"not found"})
            return

        request_data = RequestData(target.query_string_extractor, target.body_extractor)
        await target.handler(request_data)
        await send({"type": "http.response.start", "status": 200})
        await send({"type": "http.response.body", "body": b"ok"})
```

</CodeBlock>


With the lastest changes we endup with the following structure
<CodeBlock lang="md">

```md
(root)
 -> asgi (folder): all frameworks files are here
 ---> app.py - Contain all the ASGI interface that we need to implement
 ---> router.py - Contain the router classes responsible to store and match requests X handlers
 ---> api_router.py - Contain the router class that we can use to add multiple instances of it to the app
 ---> types.py - Contain a few types used in the framework
 ---> request_data.py - Contain a really small structure of how we could pass request data to handlers
```

</CodeBlock>

And that's it!
Let's try to test it!

<CodeBlock lang="python" filename="sample.py">

```python
from asgi.app import App
from asgi.api_router import ApiRouter
from asgi.request_data import RequestData
from asgi.types import Methods

router1_pkg_sample_1 = ApiRouter()

@router1_pkg_sample_1.get("/home")
async def home(request_data):
    print("home triggered")


router2_pkg_sample_2 = ApiRouter()
@router2_pkg_sample_2.get("/about")
async def about(request_data):
    print("about triggered")


def qs_extractor(qs: dict) -> dict:
    return qs

def body_extractor(body: bytes) -> int:
    return 1

@router2_pkg_sample_2.multi_methods(
    "/about/careers",
    [Methods.GET, Methods.POST],
    qs_extractor,
    body_extractor
)
async def about(request_data: RequestData[dict, int]):
    print("about careers triggered")
    qs = await request_data.get_query_string_params()
    body = await request_data.get_body()
    print(qs, body)


app = App()
app.include_routes([router1_pkg_sample_1, router2_pkg_sample_2])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

</CodeBlock>

You can test it with `python sample.py` or `uvicorn sample:app` both should work just fine.

I think we have enough for this part, we have evolved our framework a little bit, it's handling multiple routes and multiple methods and also have a draft structure 
for how data flows through the application.


*[!Repository!](https://github.com/teod-sh/diy_asgi_framework)*

*[Link for Part-1!](/diy-asgi-web-framework)*

*[Link for Part-3!](/diy-asgi-web-framework-pt3)*

Thank you for reading! I hope you learned a little bit. If you have any complaint or want to talk please, drop me a message on LinkedIn!