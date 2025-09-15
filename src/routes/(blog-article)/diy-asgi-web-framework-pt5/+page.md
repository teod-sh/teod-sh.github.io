---
slug: diy-asgi-web-framework-pt4
title: Understanding and Creating your Own ASGI Web Framework [Part-5]
date: 2025-09-15T00:00:21.800Z
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

TO-DO

### Headers and Query string

TO-DO

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

TO-DO

<CodeBlock lang="python" filename="sample.py">

```python
from asgi.app import App
from asgi.api_router import ApiRouter
from asgi.background_tasks import get_background_tasks, create_task
from asgi.http_responses import OK_JSONResponse
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


app = App()
app.include_routes([router1, router2])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```


</CodeBlock>


You can test it with `python sample.py` or `uvicorn sample:app` both should work just fine.

This step has been really nice for me because I have never created a background task system before. This was a really great experience.
I hope you enjoyed it and learned something new!


*[!Source Code!](https://github.com/teod-sh/diy_asgi_framework)*

*[Link for Part-3!](/diy-asgi-web-framework-pt3)*

*Link for Part-5 will be here when ready!*

Thank you for reading! If you have any complaint or want to talk, please, drop me a message on LinkedIn!