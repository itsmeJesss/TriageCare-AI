# AWS Setup Instructions for AuraTriage AI

This guide walk you through setting up the AWS resources required for the Healthcare Triage System.

## 1. S3 Bucket Setup
1. Log in to the [AWS S3 Console](https://s3.console.aws.amazon.com/).
2. Create a new bucket (e.g., `aura-triage-images`).
3. **Permissions:**
   - Uncheck "Block all public access" (only if you want to display images directly via S3 URLs, though it's better to keep them private and use Signed URLs in production).
   - For this MVP, you can keep it private and the Express server will handle uploads.

## 2. Amazon Rekognition Custom Labels
1. Go to [Amazon Rekognition Custom Labels](https://console.aws.amazon.com/rekognition/custom-labels).
2. Create a new Project.
3. **Dataset:**
   - Upload labeled images for three classes: `LOW`, `MEDIUM`, `HIGH`.
   - You need at least 10 images per label for a basic model.
4. **Train Model:**
   - Start training and wait for it to complete.
5. **Start Model:**
   - Once trained, "Start" the model. Copy the `ProjectVersionArn`.

## 3. SNS Topic Setup
1. Go to [Amazon SNS Console](https://console.aws.amazon.com/sns/v3/home).
2. Create a "Standard" Topic named `HealthcareAlerts`.
3. Create a **Subscription**:
   - Protocol: `Email` or `SMS`.
   - Endpoint: Your email or phone number.
   - Confirm the subscription via the link sent to you.

## 4. Lambda Function Setup
1. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda).
2. Create a function: `TriageProcessor` (Node.js runtime).
3. **Code:** Paste the contents of `lambda/index.js` into the editor.
4. **Environment Variables:**
   - `REKOGNITION_MODEL_ARN`: Your model's ARN.
   - `SNS_TOPIC_ARN`: Your SNS topic's ARN.
   - `RESULTS_TABLE`: If using DynamoDB, the table name.
5. **Permissions (Execution Role):**
   - Attach policies: `AmazonS3ReadOnlyAccess`, `AmazonRekognitionFullAccess`, `AmazonSNSFullAccess`, `AmazonDynamoDBFullAccess`.
6. **Trigger:**
   - Add Trigger -> S3.
   - Select your bucket.
   - Event type: `All object create events`.
   - Prefix: `uploads/`.

## 5. IAM User for Web App
1. Go to [IAM Console](https://console.aws.amazon.com/iam).
2. Create a user: `aura-triage-app-user`.
3. Access type: `Programmatic access`.
4. Attach Policy: `AmazonS3FullAccess` (or a restricted policy for just your bucket).
5. Copy the `Access Key ID` and `Secret Access Key` to your `.env` file.

## 6. Local Setup
1. Update `.env` with:
   ```env
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   AWS_REGION=us-east-1
   AWS_S3_BUCKET_NAME=your_bucket_name
   AWS_SNS_TOPIC_ARN=your_sns_arn
   ```
2. Restart the server.
