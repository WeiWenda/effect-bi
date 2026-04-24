import neo4j, { Driver, Session } from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const {
  NEO4J_URI = 'bolt://localhost:7687',
  NEO4J_USER = 'neo4j',
  NEO4J_PASSWORD = '',
  NEO4J_DATABASE = 'neo4j'
} = process.env;

const driver: Driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

export function getSession(): Session {
  return driver.session({ database: NEO4J_DATABASE });
}

export async function closeDriver(): Promise<void> {
  await driver.close();
}

export default driver;
