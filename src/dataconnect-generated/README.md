# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetGameTypes*](#getgametypes)
  - [*GetUserTrainingSessions*](#getusertrainingsessions)
- [**Mutations**](#mutations)
  - [*CreateNewUser*](#createnewuser)
  - [*UpdateTrainingSessionFeedback*](#updatetrainingsessionfeedback)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetGameTypes
You can execute the `GetGameTypes` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getGameTypes(): QueryPromise<GetGameTypesData, undefined>;

interface GetGameTypesRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetGameTypesData, undefined>;
}
export const getGameTypesRef: GetGameTypesRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getGameTypes(dc: DataConnect): QueryPromise<GetGameTypesData, undefined>;

interface GetGameTypesRef {
  ...
  (dc: DataConnect): QueryRef<GetGameTypesData, undefined>;
}
export const getGameTypesRef: GetGameTypesRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getGameTypesRef:
```typescript
const name = getGameTypesRef.operationName;
console.log(name);
```

### Variables
The `GetGameTypes` query has no variables.
### Return Type
Recall that executing the `GetGameTypes` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetGameTypesData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetGameTypesData {
  gameTypes: ({
    id: UUIDString;
    name: string;
    description: string;
    primaryCognitiveArea: string;
    recommendedDurationMinutes?: number | null;
  } & GameType_Key)[];
}
```
### Using `GetGameTypes`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getGameTypes } from '@dataconnect/generated';


// Call the `getGameTypes()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getGameTypes();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getGameTypes(dataConnect);

console.log(data.gameTypes);

// Or, you can use the `Promise` API.
getGameTypes().then((response) => {
  const data = response.data;
  console.log(data.gameTypes);
});
```

### Using `GetGameTypes`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getGameTypesRef } from '@dataconnect/generated';


// Call the `getGameTypesRef()` function to get a reference to the query.
const ref = getGameTypesRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getGameTypesRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.gameTypes);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.gameTypes);
});
```

## GetUserTrainingSessions
You can execute the `GetUserTrainingSessions` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getUserTrainingSessions(vars: GetUserTrainingSessionsVariables): QueryPromise<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;

interface GetUserTrainingSessionsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserTrainingSessionsVariables): QueryRef<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;
}
export const getUserTrainingSessionsRef: GetUserTrainingSessionsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getUserTrainingSessions(dc: DataConnect, vars: GetUserTrainingSessionsVariables): QueryPromise<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;

interface GetUserTrainingSessionsRef {
  ...
  (dc: DataConnect, vars: GetUserTrainingSessionsVariables): QueryRef<GetUserTrainingSessionsData, GetUserTrainingSessionsVariables>;
}
export const getUserTrainingSessionsRef: GetUserTrainingSessionsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getUserTrainingSessionsRef:
```typescript
const name = getUserTrainingSessionsRef.operationName;
console.log(name);
```

### Variables
The `GetUserTrainingSessions` query requires an argument of type `GetUserTrainingSessionsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetUserTrainingSessionsVariables {
  userId: UUIDString;
}
```
### Return Type
Recall that executing the `GetUserTrainingSessions` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetUserTrainingSessionsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetUserTrainingSessions`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getUserTrainingSessions, GetUserTrainingSessionsVariables } from '@dataconnect/generated';

// The `GetUserTrainingSessions` query requires an argument of type `GetUserTrainingSessionsVariables`:
const getUserTrainingSessionsVars: GetUserTrainingSessionsVariables = {
  userId: ..., 
};

// Call the `getUserTrainingSessions()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getUserTrainingSessions(getUserTrainingSessionsVars);
// Variables can be defined inline as well.
const { data } = await getUserTrainingSessions({ userId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getUserTrainingSessions(dataConnect, getUserTrainingSessionsVars);

console.log(data.trainingSessions);

// Or, you can use the `Promise` API.
getUserTrainingSessions(getUserTrainingSessionsVars).then((response) => {
  const data = response.data;
  console.log(data.trainingSessions);
});
```

### Using `GetUserTrainingSessions`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getUserTrainingSessionsRef, GetUserTrainingSessionsVariables } from '@dataconnect/generated';

// The `GetUserTrainingSessions` query requires an argument of type `GetUserTrainingSessionsVariables`:
const getUserTrainingSessionsVars: GetUserTrainingSessionsVariables = {
  userId: ..., 
};

// Call the `getUserTrainingSessionsRef()` function to get a reference to the query.
const ref = getUserTrainingSessionsRef(getUserTrainingSessionsVars);
// Variables can be defined inline as well.
const ref = getUserTrainingSessionsRef({ userId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getUserTrainingSessionsRef(dataConnect, getUserTrainingSessionsVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.trainingSessions);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.trainingSessions);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateNewUser
You can execute the `CreateNewUser` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createNewUser(vars: CreateNewUserVariables): MutationPromise<CreateNewUserData, CreateNewUserVariables>;

interface CreateNewUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateNewUserVariables): MutationRef<CreateNewUserData, CreateNewUserVariables>;
}
export const createNewUserRef: CreateNewUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createNewUser(dc: DataConnect, vars: CreateNewUserVariables): MutationPromise<CreateNewUserData, CreateNewUserVariables>;

interface CreateNewUserRef {
  ...
  (dc: DataConnect, vars: CreateNewUserVariables): MutationRef<CreateNewUserData, CreateNewUserVariables>;
}
export const createNewUserRef: CreateNewUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createNewUserRef:
```typescript
const name = createNewUserRef.operationName;
console.log(name);
```

### Variables
The `CreateNewUser` mutation requires an argument of type `CreateNewUserVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateNewUserVariables {
  email: string;
  username: string;
}
```
### Return Type
Recall that executing the `CreateNewUser` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateNewUserData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateNewUserData {
  user_insert: User_Key;
}
```
### Using `CreateNewUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createNewUser, CreateNewUserVariables } from '@dataconnect/generated';

// The `CreateNewUser` mutation requires an argument of type `CreateNewUserVariables`:
const createNewUserVars: CreateNewUserVariables = {
  email: ..., 
  username: ..., 
};

// Call the `createNewUser()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createNewUser(createNewUserVars);
// Variables can be defined inline as well.
const { data } = await createNewUser({ email: ..., username: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createNewUser(dataConnect, createNewUserVars);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
createNewUser(createNewUserVars).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

### Using `CreateNewUser`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createNewUserRef, CreateNewUserVariables } from '@dataconnect/generated';

// The `CreateNewUser` mutation requires an argument of type `CreateNewUserVariables`:
const createNewUserVars: CreateNewUserVariables = {
  email: ..., 
  username: ..., 
};

// Call the `createNewUserRef()` function to get a reference to the mutation.
const ref = createNewUserRef(createNewUserVars);
// Variables can be defined inline as well.
const ref = createNewUserRef({ email: ..., username: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createNewUserRef(dataConnect, createNewUserVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

## UpdateTrainingSessionFeedback
You can execute the `UpdateTrainingSessionFeedback` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateTrainingSessionFeedback(vars: UpdateTrainingSessionFeedbackVariables): MutationPromise<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;

interface UpdateTrainingSessionFeedbackRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateTrainingSessionFeedbackVariables): MutationRef<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;
}
export const updateTrainingSessionFeedbackRef: UpdateTrainingSessionFeedbackRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateTrainingSessionFeedback(dc: DataConnect, vars: UpdateTrainingSessionFeedbackVariables): MutationPromise<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;

interface UpdateTrainingSessionFeedbackRef {
  ...
  (dc: DataConnect, vars: UpdateTrainingSessionFeedbackVariables): MutationRef<UpdateTrainingSessionFeedbackData, UpdateTrainingSessionFeedbackVariables>;
}
export const updateTrainingSessionFeedbackRef: UpdateTrainingSessionFeedbackRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateTrainingSessionFeedbackRef:
```typescript
const name = updateTrainingSessionFeedbackRef.operationName;
console.log(name);
```

### Variables
The `UpdateTrainingSessionFeedback` mutation requires an argument of type `UpdateTrainingSessionFeedbackVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateTrainingSessionFeedbackVariables {
  id: UUIDString;
  feedback?: string | null;
}
```
### Return Type
Recall that executing the `UpdateTrainingSessionFeedback` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateTrainingSessionFeedbackData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateTrainingSessionFeedbackData {
  trainingSession_update?: TrainingSession_Key | null;
}
```
### Using `UpdateTrainingSessionFeedback`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateTrainingSessionFeedback, UpdateTrainingSessionFeedbackVariables } from '@dataconnect/generated';

// The `UpdateTrainingSessionFeedback` mutation requires an argument of type `UpdateTrainingSessionFeedbackVariables`:
const updateTrainingSessionFeedbackVars: UpdateTrainingSessionFeedbackVariables = {
  id: ..., 
  feedback: ..., // optional
};

// Call the `updateTrainingSessionFeedback()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateTrainingSessionFeedback(updateTrainingSessionFeedbackVars);
// Variables can be defined inline as well.
const { data } = await updateTrainingSessionFeedback({ id: ..., feedback: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateTrainingSessionFeedback(dataConnect, updateTrainingSessionFeedbackVars);

console.log(data.trainingSession_update);

// Or, you can use the `Promise` API.
updateTrainingSessionFeedback(updateTrainingSessionFeedbackVars).then((response) => {
  const data = response.data;
  console.log(data.trainingSession_update);
});
```

### Using `UpdateTrainingSessionFeedback`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateTrainingSessionFeedbackRef, UpdateTrainingSessionFeedbackVariables } from '@dataconnect/generated';

// The `UpdateTrainingSessionFeedback` mutation requires an argument of type `UpdateTrainingSessionFeedbackVariables`:
const updateTrainingSessionFeedbackVars: UpdateTrainingSessionFeedbackVariables = {
  id: ..., 
  feedback: ..., // optional
};

// Call the `updateTrainingSessionFeedbackRef()` function to get a reference to the mutation.
const ref = updateTrainingSessionFeedbackRef(updateTrainingSessionFeedbackVars);
// Variables can be defined inline as well.
const ref = updateTrainingSessionFeedbackRef({ id: ..., feedback: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateTrainingSessionFeedbackRef(dataConnect, updateTrainingSessionFeedbackVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.trainingSession_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.trainingSession_update);
});
```

