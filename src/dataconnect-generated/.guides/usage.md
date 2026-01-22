# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { createNewUser, getGameTypes, getUserTrainingSessions, updateTrainingSessionFeedback } from '@dataconnect/generated';


// Operation CreateNewUser:  For variables, look at type CreateNewUserVars in ../index.d.ts
const { data } = await CreateNewUser(dataConnect, createNewUserVars);

// Operation GetGameTypes: 
const { data } = await GetGameTypes(dataConnect);

// Operation GetUserTrainingSessions:  For variables, look at type GetUserTrainingSessionsVars in ../index.d.ts
const { data } = await GetUserTrainingSessions(dataConnect, getUserTrainingSessionsVars);

// Operation UpdateTrainingSessionFeedback:  For variables, look at type UpdateTrainingSessionFeedbackVars in ../index.d.ts
const { data } = await UpdateTrainingSessionFeedback(dataConnect, updateTrainingSessionFeedbackVars);


```