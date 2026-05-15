import { Kafka, type Producer } from 'kafkajs';
import type { GameEvent } from '../types/game.types.js';
import { TOPICS } from './topics.js';
import { createKafkaConfig } from './client-config.js';

const BROKER = process.env.KAFKA_BROKER ?? 'localhost:9092';

const kafka: Kafka = new Kafka(createKafkaConfig('game-server'));

const producer: Producer = kafka.producer();

export async function connectProducer(): Promise<void> {
  console.log(`[Kafka] Connecting to broker: ${BROKER}`);
  await producer.connect();
  console.log('[Kafka] Producer connected');
}

export async function disconnectProducer(): Promise<void> {
  await producer.disconnect();
}

// Low-level: send any value to any topic
export async function sendToKafka(
  topic: string,
  key:   string,
  value: unknown,
): Promise<void> {
  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(value) }],
  });
}

// Convenience: send a GameEvent to the canonical game-events topic
export async function sendGameEvent(event: GameEvent): Promise<void> {
  await sendToKafka(TOPICS.GAME_EVENTS, event.sessionId, event);
}
