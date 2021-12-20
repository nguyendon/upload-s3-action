const core = require('@actions/core');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const klawSync = require('klaw-sync');
const { lookup } = require('mime-types');

const VALID_ACLS = ['private',
                    'public-read-write',
                    'public-read-write',
                    'authenticated-read',
                    'aws-exec-read',
                    'bucket-owner-read',
                    'bucket-owner-full-control',
                   ];
const AWS_KEY_ID = core.getInput('aws_key_id', {
  required: true
});
const SECRET_ACCESS_KEY = core.getInput('aws_secret_access_key', {
  required: true
});
const BUCKET = core.getInput('aws_bucket', {
  required: true
});
const SOURCE_DIR = core.getInput('source_dir', {
  required: true
});
const DESTINATION_DIR = core.getInput('destination_dir', {
  required: false
});
const ACL = core.getInput('acl', {
  required: false
});

const s3 = new S3({
  accessKeyId: AWS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY
});
const destinationDir = DESTINATION_DIR === '/' ? shortid() : DESTINATION_DIR;
const acl = !ACL ? 'authenticated-read' : ACL;
if (!VALID_ACLS.includes(acl)) {
  const errString = `Invalid ACL: ${acl}`;
  core.error(Error(errString));
  core.setFailed(errString);
}

const paths = klawSync(SOURCE_DIR, {
  nodir: true
});

function upload(params) {
  return new Promise(resolve => {
    s3.upload(params, (err, data) => {
      if (err) core.error(err);
      core.info(`uploaded - ${data.Key}`);
      core.info(`located - ${data.Location}`);
      resolve(data.Location);
    });
  });
}

function run() {
  const sourceDir = path.join(process.cwd(), SOURCE_DIR);
  return Promise.all(
    paths.map(p => {
      const fileStream = fs.createReadStream(p.path);
      let bucketPath = path.join(destinationDir, path.relative(sourceDir, p.path));
      bucketPath = bucketPath.replace(/\\/g, '/');
      const params = {
        Bucket: BUCKET,
        ACL: acl,
        Body: fileStream,
        Key: bucketPath,
        ContentType: lookup(p.path) || 'text/plain'
      };
      return upload(params);
    })
  );
}

run()
  .then(locations => {
    core.info(`object key - ${destinationDir}`);
    core.info(`object locations - ${locations}`);
    core.setOutput('object_key', destinationDir);
    core.setOutput('object_locations', locations);
  })
  .catch(err => {
    core.error(err);
    core.setFailed(err.message);
  });
