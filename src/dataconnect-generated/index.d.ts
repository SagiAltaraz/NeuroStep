import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateNewUserData {
  user_insert: User_Key;
}

export interface CreateNewUserVariables {
  email: string;
  username: string;
}

export interface GameSetting_Key {
  id: UUIDString;
  __typename?: 'GameSetting_Key';
}

export interface GameType_Key {
  id: UUIDString;
  __typename?: 'GameType_Key';
}

export interface GetGameTypesData {
  gameTypes: ({
    id: UUIDString;
    name: string;
    description: string;
    primaryCognitiveArea: string;
    recommendedDurationMinutes?: number | null;
  } & GameType_Key)[];
}

export interface GetUserTrainingSessionsData {
  trainingSessions: ({
    id: UUIDString;
    gameType: {
      name: string;
    };
      score: number;
      startTime: TimestampString;
      endTime: TimestampString;
      difficultyLevelStart: number;
      difficultyLevelEnd: number;
  } & TrainingSession_Key)[];
}

export interface GetUserTrainingSessionsVariables {
  userId: UUIDString;
}

export interface PerformanceMetric_Key {
  id: UUIDString;
  __typename?: 'PerformanceMetric_Key';
}

export interface TrainingSession_Key {
  id: UUIDString;
  __typename?: 'TrainingSession_Key';
}

export interface UpdateTrainingSessionFeedbackData {
  trainingSession_update?: TrainingSession_Key | null;
}

export interface UpdateTrainingSessionFeedbackVariables {
  id: UUIDString;
  feedback?: string | null;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface CreateNewUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateNewUserVariables): MutationRef<CreateNewUserData, CreateNewUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateNewUserVariables): MutationRef<CreateNewUserData, CreateNewUserVariables>;
  operationName: string;
}
export const createNewUserRef: CreateNewUserRef;

export function createNewUser(vars: CreateNewUserVariables): MutationPromise<CreateNewUserData, CreateNewUserVariables>;
export function createNewUser(dc: DataConnect, vars: CreateNewUserVariables): MutationPromise<CreateNewUserData, CreateNewUserVariables>;

interface GetGameTypesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetGameTypesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetGameTypesData, undefined>;
  operationName: string;
}
export const getGameTypesRef: GetGameTypesRef;

export function getGameTypes(): QueryPromise<GetGameTypesData, undefined>;
export function getGameTypes(dc: DataConnect): QueryPromise<GetGameTypesData, undefined>;

interface GetUserTrainingSessionsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserTrainingSessionsVariables): QueryRef<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetUserTrainingSessionsVariables): QueryRef<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;
  operationName: string;
}
export const getUserTrainingSessionsRef: GetUserTrainingSessionsRef;

export function getUserTrainingSessions(vars: GetUserTrainingSessionsVariables): QueryPromise<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;
export function getUserTrainingSessions(dc: DataConnect, vars: GetUserTrainingSessionsVariables): QueryPromise<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;

interface UpdateTrainingSessionFeedbackRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateTrainingSessionFeedbackVariables): MutationRef<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateTrainingSessionFeedbackVariables): MutationRef<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;
  operationName: string;
}
export const updateTrainingSessionFeedbackRef: UpdateTrainingSessionFeedbackRef;

export function updateTrainingSessionFeedback(vars: UpdateTrainingSessionFeedbackVariables): MutationPromise<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;
export function updateTrainingSessionFeedback(dc: DataConnect, vars: UpdateTrainingSessionFeedbackVariables): MutationPromise<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;

