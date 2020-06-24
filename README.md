WebSockets Broker

This is a Node.js application that brokers WebSockets communication between different systems.  For example, if System 1 wants to communicate with System 2 via WebSockets but both System 1 and System 2 are behind firewalls, the two systems can have a session setup so that communication occurs as follows:

	System 1 <--> WebSockets Broker <--> System 2
	
The WebSockets Broker is intended to be run outside the firewalls of both systems.  Each system sets up a connection with the broker and makes a request to the broker to bridge its communication with the socket from the partner system.

