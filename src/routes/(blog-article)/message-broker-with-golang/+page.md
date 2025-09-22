---
slug: message-broker-with-golang
title: Building a Message Broker from Scratch With Golang 
date: 2025-09-23T21:55:21.800Z
excerpt: Creating a message broker with golang is not that hard, but it's not that easy either.
coverImage: /images/posts/koala_golang.png
tags:
  - Golang
  - Message Broker
  - Queue
---


<script>
  import CodeBlock from "$lib/components/molecules/CodeBlock.svelte";
</script>

Nowadays its pretty common to have a message broker in somewhere in our system, but have you ever thought about how does it work?

## What is a message broker?

Message brokers in simple terms we can call it as a *mail carrier* but for systems. It will receive your letter and send it to the address you want.

Taking this from a system perspective, it allows you to talk with different systems, no matter what language they speak or framework they are using.

There are a couple of flavors available today, such as RabbitMQ, Kafka, ActiveMQ, IBM MQ, Google Cloud Pub/Sub and many more.
Each one will have its own strengths and weaknesses, but in essence they all work pretty much the same way.

<CodeBlock lang="bash">

```md
-> System [A] Produce a message and send it Broker/s with a specific "storage name"
-> Broker/s receive the message and make it available for readers
-> System [B] are interested in new messages for this specific storage and then try to read the available message
-> System [B] receives the msg and do whatever they want to.
```

</CodeBlock>

## How does it work?

There's a couple of common keywords used out there for representing key components of a message broker, such as *consumers, producers, topics, and queues*. Let's take a look on each one of them.

#### Consumers & Producers
Producers are basically systems that send events/messages to the message broker server.

On the other side, we have Consumers, the ones who consume the messages from the broker.

That's also quite common to see a system that is producer and consumer at the same time from one or more brokers or topics.

#### Topics & Queues
In simple terms, both are the same thing when considering the general idea of usage. We have normally a name for it, which will be used when you want to send or receive a message.

<CodeBlock lang="bash">

```md
your system will have something like this to represent a message:
Topic/Queue name: ABC
Message: some random byte
```

</CodeBlock>

The actual implementation of this topic/queues may vary a lot depending on the broker you are using. Some of them will guarantee the order of messages, some will not, Some of them will let you group and order messages based on a common key/id, and others don't move a byte to make it happen.

Ok, we have enough information, let's move on.

## How to implement a message broker?

Let's briefly list down all we will need first:

- A server that will be the broker
- A protocol that will be used to communicate with the broker for publishing and consuming messages
- An endpoint that will allow us to connect to the broker
- The broker should handle the "producer" and the "consumer"
- A storage that will handle the messages

Those items are present in all the brokers available today, it's the foundation of every broker. Each of those items may be very different depending on goals.
For example, there are a couple of options that implement the [AMQP protocol](https://www.rabbitmq.com/resources/specs/amqp0-9-1.pdf), such as RabbitMQ and Qpid, but other servers like [Kafka](https://kafka.apache.org/protocol) will have their own implementation, with completely different approaches.

That's enough talk, let's implement it!

## Implementing a message broker with golang

#### Storage
Let's start with the storage, for today's example we will be fine using a simple in-memory shared db to avoid overcomplicating things.
Our deal is basically to be able to save messages and retrieve them later, be safe in a concurrent environment and also have a support to read one message only once.

<CodeBlock lang="go" filename="src/topic_storage.go">

```go
package src

import (
	"context"
	"sync"
)

type Message struct {
	Key   string
	Value []byte
}

type TopicStorage struct {
	storage       []*Message
	lastReadIndex int
	lock          sync.Mutex
}

func NewTopicStorage() *TopicStorage {
	return &TopicStorage{
		storage:       make([]*Message, 0),
		lastReadIndex: -1,
	}
}

func (m *TopicStorage) Put(ctx context.Context, msg *Message) error {
	m.lock.Lock()
	defer m.lock.Unlock()

	m.storage = append(m.storage, msg)

	return nil
}

func (m *TopicStorage) GetNextMessage(ctx context.Context) (*Message, error) {
	m.lock.Lock()
	defer m.lock.Unlock()

	if m.isOutOfBounds(m.lastReadIndex + 1) {
		return nil, NO_MORE_MESSAGES
	}
	target := m.getNextIndex()

	return m.storage[target], nil
}

func (m *TopicStorage) getNextIndex() int {
	m.lastReadIndex += 1
	return m.lastReadIndex
}

func (m *TopicStorage) isOutOfBounds(index int) bool {
	return index < 0 || index >= len(m.storage)
}

func (m *TopicStorage) IsEmpty() bool {
	m.lock.Lock()
	defer m.lock.Unlock()
	return len(m.storage) == 0
}
```

</CodeBlock>


#### Topic
For our topic implementation, we don't need anything special here, only one service that will handle incoming messages and save them in the storage asynchronously.

<CodeBlock lang="go" filename="src/topic.go">

```go
package src

import (
	"context"
	"fmt"
	"time"
)

type Topic struct {
	Name    string
	storage *TopicStorage
}

func NewTopicService(name string, topicStorage *TopicStorage) *Topic {
	return &Topic{
		Name:    name,
		storage: topicStorage,
	}
}

func (m *Topic) WatchForMessages(ctx context.Context, inMessagesChannel <-chan *Message, outErrorsChannel chan<- error) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-inMessagesChannel:
			err := m.storage.Put(ctx, msg)
			if err != nil {
				outErrorsChannel <- err
				continue
			}

			fmt.Println("Message published")

		default:
			fmt.Println("waiting...no messages to process")
			time.Sleep(1 * time.Second)
		}
	}
}

func (m *Topic) GetStorageReference() *TopicStorage {
	return m.storage
}
```

</CodeBlock>
 

#### Consumer
In our consumer, we basically need access to the storage and check it from time to time to see if there are any new messages, if so, we will read it and send it to our consumer client.

<CodeBlock lang="go" filename="src/consumer.go">

```go
package src

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"
)

type Consumer struct {
	targetStorage *TopicStorage
}

func NewConsumer(targetStorage *TopicStorage) *Consumer {
	return &Consumer{
		targetStorage: targetStorage,
	}
}

func (m *Consumer) Consume(ctx context.Context, outMessagesChannel chan<- *Message, outErrorsChannel chan<- error) {
	for {
		select {

		case <-ctx.Done():
			return
		default:
			if m.targetStorage.IsEmpty() {
				log.Println("No messages to consume")
				time.Sleep(1 * time.Second)
				continue
			}

			message, err := m.targetStorage.GetNextMessage(ctx)

			if err != nil {
				if errors.Is(err, NO_MORE_MESSAGES) {
					time.Sleep(1 * time.Second)
					log.Println("No more messages to consume...")
					continue
				}
				outErrorsChannel <- err
				continue
			}
			fmt.Println("sending message...")
			outMessagesChannel <- message
		}
	}
}
```

</CodeBlock>


#### Manager
To orchestrate it all, we will need some sort of manager that will handle topic/storage creation and also provide access to them, making sure that we don't have any race conditions.

<CodeBlock lang="go" filename="src/message_broker_manager.go">

```go
package src

import "sync"

type MessageBrokerManager struct {
	Topics    map[string]*Topic
	Consumers map[string]*Consumer

	topicsLock    sync.Mutex
	consumersLock sync.Mutex
}

func NewTopicManager() *MessageBrokerManager {
	return &MessageBrokerManager{
		Topics:    make(map[string]*Topic),
		Consumers: make(map[string]*Consumer),
	}
}

func (m *MessageBrokerManager) GetTopicByName(name string) *Topic {
	m.topicsLock.Lock()
	defer m.topicsLock.Unlock()
	if topic, ok := m.Topics[name]; ok {
		return topic
	}

	m.Topics[name] = m.createNewTopic(name)
	return m.Topics[name]
}

func (m *MessageBrokerManager) createNewTopic(name string) *Topic {
	storage := NewTopicStorage()
	topic := NewTopicService(name, storage)
	return topic
}

func (m *MessageBrokerManager) GetConsumerByTopicName(name string) *Consumer {
	m.consumersLock.Lock()
	defer m.consumersLock.Unlock()
	if consumer, ok := m.Consumers[name]; ok {
		return consumer
	}

	m.Consumers[name] = m.createNewConsumer(name)
	return m.Consumers[name]
}

func (m *MessageBrokerManager) createNewConsumer(topicName string) *Consumer {
	topic := m.GetTopicByName(topicName)
	return NewConsumer(topic.GetStorageReference())
}
```

</CodeBlock>


### Testing
We have already almost all the foundation we will need, but we are missing the protocol implementation, server with endpoints and a client to test it.

For simplicity, I have set just a dummy implementation that implements only the basics for make it work using a server that will handle websocket connections and translate a dummy protocol for communication.

I won't put the code here because it's too many lines, but you can find the files here in my [github repo](https://github.com/teod-sh/diy_message_broker), the files are: [main.go](https://github.com/teod-sh/diy_message_broker/blob/main/main.go) and [client.go](https://github.com/teod-sh/diy_message_broker/blob/main/client.go) 

How to run it?

<CodeBlock lang="bash">

```bash
go run main.go #[first terminal to run the server]
MODE=producer TOPIC=mytopic go run client.go #[second terminal to run the producer]
MODE=consumer TOPIC=mytopic go run client.go #[third terminal to run the consumer]
```

</CodeBlock>


You now have a working message broker! Pretty simple, but still insightful.
We have coveraged the basics of a message broker, but there are a lot of things that can be improved and implemented.

Keep an eye in my blog, the next part will be released soon with more features.

Thank you for reading! I hope you learned a little bit. If you have any complaint or want to talk please, drop me a message on linkedin!

**[Source Code](https://github.com/teod-sh/diy_message_broker)**
