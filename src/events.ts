const events = {
	eventName: {
		name: "Event #1",
		date: "01/01/2025",
		someUrl: "https://some.url",
	},
	otherEventName: {
		name: "Event #2",
		date: "01/01/2026",
		someUrl: "https://some.url",
	},
};

export const currentEvent = events.eventName; // or Object.values(events).at(-1)!
