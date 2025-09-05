---
slug: websocket-lb-least-connection
title: Why RoundRobin Load Balancing is Killing The Scalability of Your WebSocket API Servers
date: 2025-09-09T21:55:21.800Z
excerpt: How to to kill your long live connection service
coverImage: /images/posts/project-structure.jpg
tags:
  - Load Balancing
  - Scalability
  - Round Robin
  - Least Connection
  - System Design
---


<script>
  import CodeBlock from "$lib/components/molecules/CodeBlock.svelte";
  import Image from "$lib/components/atoms/Image.svelte";
  import LoadBalancingChart from "$lib/components/molecules/LoadBalancingChart.svelte";
</script>


# Load Balancing

Load balancing has been one of those things that I would normally stick with the default built-in of some provider. 
I can literally count, on one hand, the times I've had to dig deep into it, and that makes total sense because round-robin works just fine for most scenarios.

<b>But the Truth is: Life is not a strawberry (As a friend of mine would say | Yep, that makes sense only in Portuguese).</b> 

Your app grows, your traffic patterns change, and suddenly that trusty round-robin algorithm is doing you dirty.

Sure, round-robin comes out of the box with pretty much every load balancer and API gateway you'll see out there. It's the safest default choice. But you may face a day when burst traffic arrives that could kill half of your machines while the other part is playing golf with ChatGPT.


### Round Robin

The basic idea behind this balancing algorithm is, circle around the available servers every time a new request arrives

<CodeBlock lang="python" filename="sample.py">

```py
servers = [
    "server1", "server2", "server3",
]
idx = 0
# This idx will target the server that should handle the current request
# Every new request this idx will move by +1 until hit the end
# Then after that the idx will move to 0 again, and that will repeat forever
```

</CodeBlock>

So that is really great, basic but works as expected, evenly distributed requests thought it does not consider any server load, errors, and etc... 

That's pretty much static the only dynamic consideration that we have here is in real LB/Api Gateways you normally have a built-in service discovery to be able to know which servers are alive.

### Least Connection

Least-Connection is not exactly the most versatile option that we have available but solve this problem with excellence when we are talking about long live connections
as we have for websocket-based applications.

It will balance incoming requests based on the currently ongoing connection within all those available machines. So, instead of moving
targets in circle like round-robin, we select the target with the lower number of ongoing requests.

While Least Connection is not the most dynamic algorithm available, it shines in performance because there's no overhead, while all the dynamic options available will inevitably add some overhead due to their flexibility for balancing.


## Talk is cheap

I did a few samples to make this idea a little bit more perceptive. 

My setup:
- 5 Simple Websocket Servers
- 1 Load Balancer Server
- 1 Client Script dispatching a couple of concurrent requests

<LoadBalancingChart/>


It's clear the difference between using one to another, the least connection can balance the server usage way better considering open connections, 
while the other options may fail really hard.

[code here](https://github.com/teod-sh/websocket-lb-sample)
It's a simple code, there's no doc there, but for illustration purposes that's fine.

Thank you for reading! I hope you learned a little bit. If you have any complaint or want to talk please, drop me a message on linkedin!