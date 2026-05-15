import type { KafkaConfig, SASLOptions } from 'kafkajs';

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function createKafkaConfig(clientId: string): KafkaConfig {
  const broker = process.env.KAFKA_BROKER ?? 'localhost:9092';
  const ssl = parseBool(process.env.KAFKA_SSL, false);
  const username = process.env.KAFKA_USERNAME;
  const password = process.env.KAFKA_PASSWORD;
  const mechanism = (process.env.KAFKA_SASL_MECHANISM ?? 'scram-sha-256') as SASLOptions['mechanism'];

  const config: KafkaConfig = {
    clientId,
    brokers: [broker],
  };

  if (ssl) config.ssl = true;

  if (username && password) {
    config.sasl = { mechanism, username, password };
  }

  return config;
}

