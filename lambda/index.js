const AWS = require('aws-sdk');
const rekognition = new AWS.Rekognition();
const sns = new AWS.SNS();
const dynamodb = new AWS.DynamoDB.DocumentClient();

/*
  This Lambda function is triggered by an S3 upload event.
  It sends the image to Rekognition Custom Labels, 
  extracts the classification result, and sends an SNS alert if HIGH severity.
*/

exports.handler = async (event) => {
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    // Extract Patient ID from filename (assuming format: patientId-filename.jpg)
    const patientId = key.split('/')[1].split('-')[0];

    try {
        console.log(`Processing image: s3://${bucket}/${key}`);

        // 1. Call Rekognition Custom Labels
        // Note: You need to have a trained model ARN
        const rekParams = {
            ProjectVersionArn: process.env.REKOGNITION_MODEL_ARN,
            Image: {
                S3Object: {
                    Bucket: bucket,
                    Name: key,
                },
            },
            MaxResults: 1,
            MinConfidence: 75,
        };

        const rekData = await rekognition.detectCustomLabels(rekParams).promise();
        
        let severity = 'LOW'; // Default
        if (rekData.CustomLabels && rekData.CustomLabels.length > 0) {
            severity = rekData.CustomLabels[0].Name.toUpperCase();
        }

        console.log(`Classification result for ${patientId}: ${severity}`);

        // 2. Update Database (e.g., DynamoDB)
        // This allows the frontend to poll or receive updates
        await dynamodb.update({
            TableName: process.env.RESULTS_TABLE,
            Key: { patientId: patientId },
            UpdateExpression: "set severity = :s, status = :st, updatedAt = :u",
            ExpressionAttributeValues: {
                ":s": severity,
                ":st": "COMPLETED",
                ":u": new Date().toISOString()
            }
        }).promise();

        // 3. SNS Alert for HIGH severity
        if (severity === 'HIGH') {
            const snsParams = {
                Message: `URGENT: High severity condition detected for Patient ID: ${patientId}. Please review immediately. Location data is stored in the system.`,
                Subject: 'Healthcare Alert: HIGH Severity Condition Detected',
                TopicArn: process.env.AWS_SNS_TOPIC_ARN || process.env.SNS_TOPIC_ARN
            };
            await sns.publish(snsParams).promise();
            console.log('SNS Notification Sent.');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Success", severity }),
        };

    } catch (error) {
        console.error('Error processing image:', error);
        throw error;
    }
};
