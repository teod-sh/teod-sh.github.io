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

Today we will add support for some features, handling *lifespan events*, events that the ASGI server provides to our application and also create our own *background task system*.

### ASGI Events

In my [First Article](/diy-asgi-web-framework) I have shown only one event type, the HTTP request event, but there are a few more that we can handle in our framework.

Events are triggered internally by the ASGI server(uvicorn, hypercorn,...). All of them are sent the same way we saw for the HTTP event, server will call our application passing the payload with that event.

Some events are triggered every request, as we saw in the HTTP event, and that also occurs for websocket event. But there are events that are triggered once as we have for 'startup' and 'shutdown' events, which are triggered within a lifespan cycle.
Those differences are because they are distinct protocols/events.

Ok, this may seem a bit confusing at first, but I'll try to clarify it as much as possible.

*Request-based events* are triggered every time a request arrives, as in for HTTP or websocket events. Which translates to the following flow:

<CodeBlock lang="markdown">


```md
Client Request -> Web Server Handles it -> Web Server Call our framework -> Our framework handles it using the __call__ method (Entry Point)
```

</CodeBlock>

Now, on the other side, *lifespan events* are triggered in a different way, it is triggered once, when starts our server and also triggers again when the server is shutting down.

<CodeBlock lang="markdown">


```md
Server starts -> Server send lifespan event to App -> App handles it using the __call__ method (Entry Point)
At this point you can either "while true" because the server will allow your function runs until the server needs to shut down, or you can just return and do nothing.


If you have decided to handle the lifespan, you will have two events to handle within the lifespan cycle:
- lifespan.startup (this one indicates that the server is starting up)
- lifespan.shutdown (this one indicates that the server is shutting down)
```

</CodeBlock>

What do I mean by "while true"? It means that your function will be triggered once, but you are allowed to keep it running until you want.

*But!*, worth to keep in mind that to be able to receive the events info from lifespan cycle you have to call `await receive()` and this call will block the execution until an event arrives, so to trigger another code that must keep running, you have to dispatch it as a task for the current running event loop


<CodeBlock lang="python" filename="event_cycle_sample.py">


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
- create/destroy instances of some class that will be shared across application
- allow users to trigger whatever they want to, like a database connection/disconnection
- gracefully shutdown the server
- handles background tasks triggering
etc...

Well, that's enough about events, at least for now. Let's move on!

### Scope of the day

We now have a lot of potential tasks to manage today but for now, let's handle the startup trigger and shutdown trigger in a 
very simple way and then invest a little bit more time in our background task system.

What could we expect from our background task? The deal is to the have the following features:
-   Api must be simple
-   We must have some way for managing timeout of tasks
-   We must have some way to retry tasks that failed
-   We must have some way to limit the number of tasks running at the same time
-   We may have a way to register one or more tasks at once
-   We must have a graceful shutdown
-   We must make sure it works safely in a concurrent environment (thread environment is not our deal today)

that's all, at least for now.

## Background tasks

<CodeBlock lang="python" filename="asgi/background_tasks.py">

```python
# Ommitted imports and helpers code, to see the full file code please visite the repository link at the bottom of the page
class BackgroundTasks:

    def __init__(self, max_running_tasks: int = 5):
        assert isinstance(max_running_tasks, int), "max_running_tasks must be an integer"
        assert max_running_tasks >= 0 , "max_running_tasks must be minimum 0"

        self.max_running_tasks = max_running_tasks

        self._is_server_shutting_down = False
        self._tasks_map: Dict[str, Task] = {}
        self._task_queue = asyncio.Queue()
        self._on_going_tasks = 0
        self._lock = asyncio.Lock()

    async def shutdown(self, timeout: float = 30.0) -> None:
        self._is_server_shutting_down = True
        print("shutting down background tasks")
        start_time = time.time()

        await self._clean_queue()

        while (time.time() - start_time) < timeout:
            async with self._lock:
                if self._on_going_tasks <= 0:
                    return

            await asyncio.sleep(0.2)

        async with self._lock:
            if self._on_going_tasks > 0:
                print(f"Warning: {self._on_going_tasks} tasks still running after shutdown timeout")

    async def _clean_queue(self):
        async with self._lock:
            while not self._task_queue.empty():
                _id = await self._task_queue.get()
                print(f"removing task from queue: {_id}")
                self._task_queue.task_done()

    @staticmethod
    def _generate_task_id(handler_name: str) -> str:
        _id = str(uuid.uuid4())
        timestamp = int(time.time())
        return f"{handler_name}_{_id}_{timestamp}"

    @cancel_if_server_is_shutting_down(return_value=None)
    async def add_tasks(self, tasks: List[Task]) -> None:
        async with self._lock:
            print(f"adding tasks: {len(tasks)}")
            for task in tasks:
                task_id = self._generate_task_id(task.handler.__name__)
                self._tasks_map[task_id] = task
                await self._task_queue.put(task_id)

    @cancel_if_server_is_shutting_down(return_value=[])
    async def _get_tasks_to_process(self) -> List[str]:
        to_process = []
        async with self._lock:
            if self._task_queue.empty() or self._on_going_tasks == self.max_running_tasks:
                return to_process

            for i in range(self.max_running_tasks - self._on_going_tasks):
                if self._task_queue.empty():
                    break
                task_id = await self._task_queue.get()
                to_process.append(task_id)
                self._task_queue.task_done()
                self._on_going_tasks += 1

        return to_process

    @cancel_if_server_is_shutting_down(return_value=None)
    async def _put_back_to_queue_if_allowed(self, task_id: str) -> bool:
        task = self._tasks_map.get(task_id)
        if task is None:
            return False

        if task.get_attempts() >= task.max_retries:
            print(f"task retry count exceeded: {task_id}")
            return False

        task.increment_attempts()
        async with self._lock:
            await self._task_queue.put(task_id)

        return True

    async def _run_task(self, target: str) -> None:
        enqueued = False
        try:
            print(f"trying to process: {target}")
            async with asyncio.timeout(self._tasks_map[target].timeout_after):
                task = self._tasks_map[target]
                await task.handler(task.params)
                print(f"finished task: {target}")

        except TimeoutError:
            print(f"task timeout: {target}")
            enqueued = await self._put_back_to_queue_if_allowed(target)
        except Exception as e:
            print(f"task error: {target} {e}")
            # exceptions should be handled within the handler
        finally:
            if not enqueued:
                del self._tasks_map[target]
            async with self._lock:
                self._on_going_tasks -= 1

    @cancel_if_server_is_shutting_down(return_value=None)
    async def run_tasks(self) -> None:
        print(f"running tasks: {self._on_going_tasks}")
        to_process = await self._get_tasks_to_process()

        print(f"tasks to process: {to_process}")
        running_loop = asyncio.get_running_loop()

        for task_id in to_process:
            print(f"running task: {task_id}")
            running_loop.create_task(self._run_task(task_id))

        print(f"on going tasks: {self._on_going_tasks}")
```

</CodeBlock>

With this implementation we have now a great starting point to handle background tasks. There's still room for improvements, but we will deal with that in later parts.

We have covered all the items from our goals for background tasks, so let's make some addition to our App class.


## Handling lifespan events & Background tasks

Here, as I said before, we will add a simple handler for lifespan events, just to show how it works at the same time we add support for background tasks.

<CodeBlock lang="python" filename="asgi/app.py">

```python
class App:

    def __init__(self, max_running_tasks: int = 2):
        self._router = None
        self._bg_tasks = _create_background_tasks_instance(max_running_tasks=max_running_tasks)

    # ommitted other methods
    async def __call__(self, scope: ASGIScope, receive: ASGIReceive, send: ASGISend):
        if scope['type'] == 'http':
            return await self._handle_http_request(scope, receive, send)

        if scope["type"] == "lifespan":
            return await self._handle_lifespan(receive, send)

        return None

    async def _handle_lifespan(
        self, receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]]
    ):
        async def run_bg_tasks():
            while True:
                await self._bg_tasks.run_tasks()
                await asyncio.sleep(0.5)

        running_loop = asyncio.get_running_loop()
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                running_loop.create_task(run_bg_tasks())
                await send({"type": "lifespan.startup.complete"})

            elif message["type"] == "lifespan.shutdown":
                await self._bg_tasks.shutdown()
                await send({"type": "lifespan.shutdown.complete"})
                return
    # ommitted other methods
```

</CodeBlock>

Those app changes are pretty straightforward, but I hope you now have a better understanding of how it works.

## Testing

Let's add a few modifications to our sample app to test our new features.

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

This step has been really nice for me because I have never created a background task system before. This was a really great experience.
I hope you enjoyed it and learned something new!


*[!Source Code!](https://github.com/teod-sh/diy_asgi_framework)*

*[Link for Part-3!](/diy-asgi-web-framework-pt3)*

*Link for Part-5 will be here when ready!*

Thank you for reading! If you have any complaint or want to talk, please, drop me a message on LinkedIn!