import type { KafkaConfig, SASLOptions } from 'kafkajs';

type SupportedSaslMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

function parseBool(value: string | undefined, fallback = false): boolean {
   if (value == null) return fallback;
   return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseBrokers(value: string | undefined): string[] {
   const raw = (value ?? 'localhost:9092')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

   return raw.map((broker) =>
      broker
         .replace(/^kafka:\/\//i, '')
         .replace(/^https?:\/\//i, '')
         .replace(/\/+$/, '')
   );
}

function parseMechanism(value: string | undefined): SupportedSaslMechanism {
   const normalized = (value ?? 'scram-sha-256').trim().toLowerCase();
   if (normalized === 'scram-sha-512') return 'scram-sha-512';
   if (normalized === 'plain') return 'plain';
   return 'scram-sha-256';
}

export function createKafkaConfig(clientId: string): KafkaConfig {
   const brokers = parseBrokers(process.env.KAFKA_BROKER);
   const ssl = parseBool(process.env.KAFKA_SSL, false);
   const username = process.env.KAFKA_USERNAME?.trim();
   const password = process.env.KAFKA_PASSWORD?.trim();
   const mechanism = parseMechanism(process.env.KAFKA_SASL_MECHANISM);
   const ca = process.env.KAFKA_CA_CERT?.replace(/\\n/g, '\n');

   const config: KafkaConfig = {
      clientId,
      brokers,
   };

   if (ssl) {
      config.ssl = ca ? { ca: [ca] } : true;
   }

   if (username && password) {
      config.sasl = { mechanism, username, password } as SASLOptions;
   }

   return config;
}
