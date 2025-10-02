---
slug: message-broker-with-golang-pt2
title: Building a Message Broker from Scratch With Golang PT-2
date: 2025-10-02T21:55:21.800Z
excerpt: Creating a message broker with golang is not that hard, but it's not that easy either.
coverImage: /images/posts/koala_golang.png
tags:
  - Golang
  - Message Broker
  - Queue
  - Communication Protocol
---


<script>
  import CodeBlock from "$lib/components/molecules/CodeBlock.svelte";
</script>

In the [last post](TODO-TODO) I have explained the basics of a message broker and how it works internally in a high level.

With that in mind, let's continue with this serie and talk a little bit about communication protocols.

## Message Broker Communications Protocol

Today many message brokers either share the same protocol or some sort of adaptation to suit a known protocol of other brokers or have their fully custom implementation.

All options are valid, from HTTP-based and Websocket-Based communication to a fully custom TCP-based communication work like a charm, and for many of us any of them will be enough...

*BUT!* life is not a strawberry [BR joke], you may eventually face a couple of problems when your load increases...

To keep things simple, Let's make some napkin math

<CodeBlock lang="markdown">

```markdown
PROTOCOL_HEADER_SIZE = 20 #bytes
PAYLOAD_SIZE = 100 #bytes

# protocol rules[directly from head] for overhead
# - As high in the network means more overhead and easy to use
# - As low in the network means less overhead and harder to use

#HTTP - Highest in the network layer
PROTOCOL_HEADER_SIZE*20 + PAYLOAD_SIZE  = 500 #bytes 
# 500bytes only for the header FOR EVERY REQUEST

#Websocket - Starts in the highest layer, but it switches to TCP after the connection is established
PROTOCOL_HEADER_SIZE*10 + PAYLOAD_SIZE = 300 #bytes [establishing connection]
# 200bytes for the header, but in the case of a websocket this will happen once per connection,
# after that the traffic will be exactly the payload size for in/out msgs + a few framing headers bytes. 
# So for our Example 100bytes payload + ~10 bytes headers per message


#TCP - Lowest in the network layer | before that, only physical layer
# here the overhead is basically whatever you want to be, because at this point you are allowed to send data you want
# since you complain with TCP transport layer, implement your own protocol, make sure you have a client capable of handling it
PROTOCOL_HEADER_SIZE + PAYLOAD_SIZE  = 120 #bytes

```

</CodeBlock>

Those were fake values to exemplify, but the proportion of differences between them is pretty clear. I hope :)

So, Getting back to our math, let's assume we have 50 requests per second in our system. Each request generates only one message to be sent to our broker, so we can translate it as follows:

<CodeBlock lang="markdown">

```markdown
~50/requests/second * 86,400 seconds/day ~= 4_320_000 messages/day

HTTP network traffic
4_320_000 messages * HTTP value(~500bytes) ~= 2.01 GB per Day | 60.35 GB per Month(30days)

Websocket network traffic
4_320_000 messages * Websocket value(~110bytes) ~= 453.19 MB per Day | 13.28 GB per Month(30days)

TCP network traffic
4_320_000 messages * TCP overhead(~120bytes) ~= 494.38 MB per Day | 14.48 GB per Month(30days)
```

</CodeBlock>

Well, these numbers are kind of soft, but now image your message is 2 times bigger or better, each request generates 5 messages, or you are dealing with big payment systems that handle at least 100 times this volume we tested...

AWS, GCP, Azure, or any similar cloud will love you if you chose HTTP protocol :)

Ok, that's enough talking about other protocols.

## Creating your own communication protocol :)

At this point, for learning purposes you could use http, websocket, AMQP or anything you want, but for our example, I'll show how to create a custom TCP protocol.

Why TCP? Because it's easy to understand, it's very common, so it's useful to know what this looks like, and last but not least, the base idea behind a custom protocol could be applied for file format creation too, so you are learning twice paying only once :)

#### Protocol overview

Protocols are formed by basically two main parts, the first is the signature that tells about its content, and the second one is how the client X server will communicate with each other.

Let's clarify with an example, starting with the signature:

<CodeBlock lang="md">

```md
┌───────────┬──────────┬───────────┬───────────┐
│ 4 bytes        1 byte        8 bytes        N bytes  
│ Length         Msg Type     Timestamp       Payload
└───────────┴──────────┴───────────┴───────────┘

those are basically byte order format used between clientXserver communication.
When the client or server receives a message, it will start reading from its first byte and grouping bytes to interpret based on this format
so,

1 - took 4 bytes and try to read it as an integer
2 - took 1 byte and try to read it as an integer
3 - took 8 bytes and try to read it as a timestamp
4 - took the rest of the bytes and try to read it as a payload

*the same idea could be used for file format, but instead of one structure for everything, you will have some metadata saying about the line format and other details.
*anyway, this talk is also long as hell, so let's stop here...
```

</CodeBlock>

Now, we have the "flow" part. Which we translate to "how we expect to use the broker and how the broker should behave".

In the end, all these previous nice words can be translated to either "push" or "pull" communication.

Using PULL communication: That means we will always send a message to the broker to ask for a new message to process, that allows us to have a granular control of messages processing in our consumer servers, but it may be slower than PUSH.

Using PUSH communication: That means once we have connected to the broker, the broker is free to send messages as soon as it has a new one available, this push communication is faster than pull but may not respect your consumer's demands, so you have to be prepared to burst traffic in your autoscaling setup.

This is the basics for those two approaches. You may face more limitations depending on your choice, but that's not our problem today.


#### Our implementation



<CodeBlock lang="golang" filename="protocol/protocol.go">

```go
const (
	MsgTypeGoodbye byte = 0x01

	MsgTypePublish      byte = 0x02
	MsgTypeConsume      byte = 0x03
	MsgTypeConsumeEmpty byte = 0x04

	MsgBytesLength          uint8 = 4
	MsgTypeBytesLength      uint8 = 1
	MsgTimestampBytesLength uint8 = 8

	TopicNameBytesLength uint8 = 1
	MsgKeyBytesLength    uint8 = 1
)

// ProtocolMessage structure for binary protocol
// [4 bytes: message length][1 byte: message type][8 bytes: timestamp][N bytes: payload]
type ProtocolMessage struct {
	Length    uint32
	Type      byte
	Timestamp int64
	Payload   any // PubSubPayload or String
}

// PubSubPayload structure for binary protocol
// [1 byte: topic-name-length][N bytes: topic name][1 byte: msg key length][N: bytes msg key][N bytes: data]
type PubSubPayload struct {
	TopicName []byte
	MsgKey    []byte
	Data      []byte
}
```

</CodeBlock>

The above code is the base structure and the next one is the translator

<CodeBlock lang="golang" filename="protocol/protocol.go">

```go
func ParseToProtocolMessage(ioReader io.Reader) (*ProtocolMessage, error) {
	var length uint32
	if err := binary.Read(ioReader, binary.BigEndian, &length); err != nil {
		return nil, err
	}

	var msgType byte
	if err := binary.Read(ioReader, binary.BigEndian, &msgType); err != nil {
		return nil, err
	}

	var timestamp int64
	if err := binary.Read(ioReader, binary.BigEndian, &timestamp); err != nil {
		return nil, err
	}

	payloadLength := length - uint32(MsgTypeBytesLength+MsgTimestampBytesLength)
	msg := &ProtocolMessage{
		Length:    length,
		Type:      msgType,
		Timestamp: timestamp,
		Payload:   nil,
	}

	var err error
	switch msgType {
	case MsgTypeConsumeEmpty:
		msg.Payload = make([]byte, 0)
	case MsgTypePublish, MsgTypeConsume:
		msg.Payload, err = parsePubSubPayload(ioReader, payloadLength)
	default:
		msg.Payload = make([]byte, payloadLength)
		err = binary.Read(ioReader, binary.BigEndian, msg.Payload)
	}
	return msg, err
}

func WriteProtocolMessage(ioWriter io.Writer, msg *ProtocolMessage) error {

	var length = uint32(MsgTypeBytesLength + MsgTimestampBytesLength)

	switch msg.Type {
	case MsgTypeConsumeEmpty:
		length += 0
	case MsgTypePublish, MsgTypeConsume:
		payload, ok := msg.Payload.(*PubSubPayload)
		if !ok {
			return invalidPubSubPayloadError
		}
		length += payload.Length()
	default:
		length += uint32(len(msg.Payload.([]byte)))
	}

	if err := binary.Write(ioWriter, binary.BigEndian, length); err != nil {
		return err
	}

	if err := binary.Write(ioWriter, binary.BigEndian, msg.Type); err != nil {
		return err
	}

	if err := binary.Write(ioWriter, binary.BigEndian, msg.Timestamp); err != nil {
		return err
	}

	switch msg.Type {
	case MsgTypeConsumeEmpty:
		return nil
	case MsgTypePublish, MsgTypeConsume:
		return writePubSubPayload(ioWriter, msg.Payload.(*PubSubPayload))
	default:
		return binary.Write(ioWriter, binary.BigEndian, msg.Payload.([]byte))
	}
}
```

</CodeBlock>

The previous code is the core of the communication, with this we can send and receive messages in a binary format from/for any client/server.

It's time to write a basic client and server to run our new protocol.

##### Client

<CodeBlock lang="golang" filename="client.go">

```go
package main

import (
	"context"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/teod-sh/diy_message_broker/protocol"
)

const (
	ModeProducer = "producer"
	ModeConsumer = "consumer"
)

func main() {
	serverAddr := "localhost:8080"
	if envAddr := os.Getenv("SERVER_ADDR"); envAddr != "" {
		serverAddr = envAddr
	}

	conn, err := net.Dial("tcp", serverAddr)
	if err != nil {
		log.Fatal("Failed to connect to server:", err)
	}
	defer conn.Close()

	mode := ModeConsumer
	if envMode := os.Getenv("MODE"); envMode != "" {
		mode = strings.ToLower(envMode)
	}

	topic := "default"
	if envTopic := os.Getenv("TOPIC"); envTopic != "" {
		topic = envTopic
	}

	log.Printf("Connected to server at %s\n", serverAddr)
	log.Printf("Starting in %s mode for topic %s \n", mode, topic)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	signalCh := make(chan os.Signal, 1)
	signal.Notify(signalCh, os.Interrupt)
	go func() {
		<-signalCh
		log.Println("\nReceived interrupt signal. Shutting down...")
		cancel()
		os.Exit(0)
	}()

	switch mode {
	case ModeProducer:
		runProducer(conn, ctx, topic)
	case ModeConsumer:
		runConsumer(conn, ctx, topic)
	default:
		log.Fatalf("Unknown mode: %s. Use 'producer' or 'consumer'", mode)
	}

	log.Println("Disconnected from server")
}

func runProducer(conn net.Conn, ctx context.Context, topic string) {
	msgs := []string{
		"Hello, world!",
		"This is a test message",
		"This is another test message",
		"Goodbye!",
	}
	for _, msg := range msgs {
		select {
		case <-ctx.Done():
			return
		default:
			err := protocol.WriteProtocolMessage(
				conn,
				protocol.NewProtocolMessage(protocol.MsgTypePublish, protocol.NewPubSubPayload(topic, "", []byte(msg))),
			)

			if err != nil {
				log.Printf("Failed to send message: %v\n", err)
				return
			}
			time.Sleep(1 * time.Second)
		}
	}
}

func askForMsg(conn net.Conn, topic string) error {
	if err := protocol.WriteProtocolMessage(conn, protocol.NewProtocolMessage(protocol.MsgTypeConsume, protocol.NewPubSubPayload(topic, "", nil))); err != nil {
		return err
	}
	log.Println("asked for msg")
	return nil
}

func readMsg(ctx context.Context, conn net.Conn) *protocol.ProtocolMessage {
	var msg *protocol.ProtocolMessage
	var errReadingMessage error
	log.Println("trying to read msg")
	for {

		select {
		case <-ctx.Done():
			return nil
		default:
			conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))

			msg, errReadingMessage = protocol.ParseToProtocolMessage(conn)
			if errReadingMessage != nil {
				if netErr, ok := errReadingMessage.(net.Error); ok && netErr.Timeout() {
					continue
				}

				if errReadingMessage == io.EOF {
					log.Printf("\nServer closed connection\n")
				} else {
					log.Printf("Error receiving message from server: %v\n", errReadingMessage)
				}

				return nil
			}
			break
		}
		if msg != nil {
			break
		}
	}

	conn.SetReadDeadline(time.Time{})
	log.Printf("Received one msg")
	return msg
}

func runConsumer(conn net.Conn, ctx context.Context, topic string) {
	log.Printf("Subscribed to topic %s \n", topic)
	for {
		select {
		case <-ctx.Done():
			return
		default:
			if err := askForMsg(conn, topic); err != nil {
				log.Printf("Failed to ask for message: %v\n", err)
				return
			}
			time.Sleep(100 * time.Millisecond)

			msg := readMsg(ctx, conn)
			log.Printf("Received message from server: Type=0x%02x, Payload=%+v\n", msg.Type, msg.Payload)
			switch msg.Type {

			case protocol.MsgTypeConsumeEmpty:
				log.Println("No messages to consume")
				time.Sleep(200 * time.Millisecond)

			case protocol.MsgTypeConsume:
				log.Println("Received message")
				log.Printf("Message Payload: %+v\n", msg.Payload)

			default:
				log.Printf("\n[UNKNOWN MESSAGE] Type: 0x%02x\n> ", msg.Type)
			}
		}
	}
}
```

</CodeBlock>


##### Server

<CodeBlock lang="golang" filename="server.go">

```go
package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"

	"github.com/teod-sh/diy_message_broker/protocol"
	"github.com/teod-sh/diy_message_broker/src"
)

var messageBroker *src.MessageBrokerManager

func main() {
	listener, err := net.Listen("tcp", ":8080")
	if err != nil {
		log.Fatal("Failed to start server:", err)
	}
	defer listener.Close()

	fmt.Println("Server listening on :8080")
	fmt.Println("Using binary protocol format:")
	fmt.Println("  [4 bytes: length][1 byte: type][8 bytes: timestamp][N bytes: payload]")
	fmt.Println("  [1 byte: topic-name-length][N bytes: topic name][1 byte: msg key length][N: bytes msg key][N bytes: data]")

	messageBroker = src.NewTopicManager()

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Println("Failed to accept connection:", err)
			continue
		}

		go handleClient(conn)
	}
}

func handleClient(conn net.Conn) {
	defer conn.Close()
	clientAddr := conn.RemoteAddr().String()
	fmt.Printf("Client %s connected\n", clientAddr)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for {
		_msg, err := protocol.ParseToProtocolMessage(conn)
		if err != nil {
			if err == io.EOF {
				log.Printf("Client %s disconnected\n", clientAddr)
			} else {
				log.Printf("Error receiving message from %s: %v\n", clientAddr, err)
			}
			break
		}
		log.Printf("Received from %s: Type=0x%02x\n", clientAddr, _msg.Type)

		switch _msg.Type {

		case protocol.MsgTypePublish:
			if err := messageBroker.PublishTo(ctx, _msg.Payload.(*protocol.PubSubPayload)); err != nil {
				log.Printf("Failed to publish message to topic: %v\n", err)
				continue
			}
			log.Printf("Published message to topic %s\n", _msg.Payload.(*protocol.PubSubPayload).TopicName)

		case protocol.MsgTypeConsume:
			msg, err := messageBroker.ConsumeFrom(ctx, _msg.Payload.(*protocol.PubSubPayload))
			if err != nil {
				log.Printf("Failed to consume message from topic: %v\n", err)
				continue
			}

			if msg == nil {
				log.Println("sending empty msg")
				toClient := protocol.NewProtocolMessage(protocol.MsgTypeConsumeEmpty, nil)
				if err := protocol.WriteProtocolMessage(conn, toClient); err != nil {
					log.Printf("Failed to send message to %s: %v\n", clientAddr, err)
				}
				continue
			}

			toClient := protocol.NewProtocolMessage(protocol.MsgTypeConsume, msg)
			if err := protocol.WriteProtocolMessage(conn, toClient); err != nil {
				log.Printf("Failed to send message to %s: %v\n", clientAddr, err)
				continue
			}
			log.Println("msg sent to client")

		case protocol.MsgTypeGoodbye:
			if err := protocol.WriteProtocolMessage(conn, protocol.NewProtocolMessage(protocol.MsgTypeGoodbye, []byte("Goodbye from server"))); err != nil {
				log.Printf("Failed to send goodbye message to %s: %v\n", clientAddr, err)
			}
			return
		}
	}

	log.Printf("Client %s connection closed\n", clientAddr)
}
```

</CodeBlock>


This client and server has a pretty simple implementation, enough to show how things work and move around using a **pull strategy**.

It is not all the code you will need but gives you a reference of what it looks like in go code. [The full code could be found here](https://github.com/teod-sh/diy_message_broker)

### Conclusion

Now we have a working communication between client and server using TCP transport layer, sending and receiving our own message format, in a pull communication schema.

Simple but functional.

to run it

<CodeBlock lang="bash">

```bash
git clone https://github.com/teod-sh/diy_message_broker && cd diy_message_broker
go mod tidy
go run server.go #terminal1
MODE=producer TOPIC=mytopic go run client.go #terminal2
MODE=consumer TOPIC=mytopic go run client.go #terminal3
```

</CodeBlock>


Keep an eye in my blog, the next part will be released soon with more features.

Thank you for reading! I hope you learned a little bit. If you have any complaint or want to talk please, drop me a message on linkedin!

*[Link for Part-1!](/message-broker-with-golang)*

**[Source Code](https://github.com/teod-sh/diy_message_broker)**

