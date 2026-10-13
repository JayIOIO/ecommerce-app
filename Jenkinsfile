// Declarative pipeline: Jenkins runs these stages in order and stops after a failed stage.
pipeline {
  // Run on an available agent; it must have Node.js/npm and access to the Docker host.
  agent any

  // Avoid deployments racing each other and add timestamps to console logs.
  options {
    disableConcurrentBuilds()
    timestamps()
  }

  // Check the configured Git repository for new commits about every five minutes.
  triggers {
    pollSCM('H/5 * * * *')
  }

  // A non-empty build number selects existing images instead of building new ones.
  parameters {
    string(
      name: 'ROLLBACK_BUILD',
      defaultValue: '',
      description: 'Optional earlier successful numeric build number to redeploy; leave empty for this build.'
    )
  }

  // Shared values used by Compose and the deployment steps below.
  environment {
    COMPOSE_PROJECT_NAME = 'ecommerce-app'
    COMPOSE_DB_USER = 'app_user'
    IMAGE_NAMESPACE = 'ecomapp'
    IMAGE_TAG = "${BUILD_NUMBER}"
    PROXY_PORT = '8080'
  }

  stages {
    // Fetch the configured repository revision and normalize its branch name.
    stage('Checkout') {
      steps {
        script {
          def scmState = checkout scm
          // Jenkins multibranch jobs expose BRANCH_NAME; a regular SCM job reports GIT_BRANCH.
          def sourceBranch = scmState.GIT_BRANCH ?: env.BRANCH_NAME
          if (!sourceBranch) {
            // Refuse to guess the branch because deployment is limited to main.
            error('Could not determine the checked-out branch; refusing to deploy.')
          }
          // Save the clean branch name for the deployment-stage condition.
          env.CHECKED_OUT_BRANCH = sourceBranch.replaceFirst('^(origin/|refs/heads/)', '')
        }
      }
    }

    // Install locked dependencies and run syntax, lint, and production-build checks.
    stage('Test') {
      steps {
        script {
          // Reject malformed rollback input before any build or deployment can occur.
          def rollbackBuild = params.ROLLBACK_BUILD.trim()
          if (rollbackBuild && !(rollbackBuild ==~ /^[0-9]+$/)) {
            error('ROLLBACK_BUILD must be a numeric successful Jenkins build number.')
          }
        }
        // npm ci installs exactly the dependencies recorded in each package lockfile.
        sh 'npm ci'
        sh 'npm ci --prefix services/auth-service'
        sh 'npm ci --prefix services/catalog-service'
        sh 'npm ci --prefix services/order-service'
        sh 'npm ci --prefix frontend'
        // This project check runs backend syntax checks, frontend lint, and frontend build.
        sh 'npm run test:ci'
      }
    }

    // Build fresh images only for normal releases; rollback reuses existing tagged images.
    stage('Image Build') {
      when {
        expression { params.ROLLBACK_BUILD.trim().isEmpty() }
      }
      steps {
        // Expose secrets only to this Compose build step; values stay in Jenkins Credentials.
        withCredentials([
          string(credentialsId: 'ecommerce-db-password', variable: 'COMPOSE_DB_PASSWORD'),
          string(credentialsId: 'ecommerce-mysql-root-password', variable: 'MYSQL_ROOT_PASSWORD'),
          string(credentialsId: 'ecommerce-jwt-secret', variable: 'JWT_SECRET')
        ]) {
          // Build all Compose images and refresh their base images where applicable.
          sh 'docker compose build --pull'
        }
      }
    }

    // Deploy only from main, selecting either this build's tag or the requested rollback tag.
    stage('Deploy') {
      when {
        expression { env.CHECKED_OUT_BRANCH == 'main' }
      }
      steps {
        script {
          // A blank parameter means deploy this pipeline run; otherwise restore the selected build.
          def rollbackBuild = params.ROLLBACK_BUILD.trim()
          def selectedTag = rollbackBuild ? rollbackBuild : env.BUILD_NUMBER
          withEnv(["IMAGE_TAG=${selectedTag}"]) {
            // Confirm every required image exists before changing the running stack.
            withCredentials([
              string(credentialsId: 'ecommerce-db-password', variable: 'COMPOSE_DB_PASSWORD'),
              string(credentialsId: 'ecommerce-mysql-root-password', variable: 'MYSQL_ROOT_PASSWORD'),
              string(credentialsId: 'ecommerce-jwt-secret', variable: 'JWT_SECRET')
            ]) {
              sh '''
                set -eu
                for image in \
                  "${IMAGE_NAMESPACE}-db:${IMAGE_TAG}" \
                  "${IMAGE_NAMESPACE}-auth-service:${IMAGE_TAG}" \
                  "${IMAGE_NAMESPACE}-catalog-service:${IMAGE_TAG}" \
                  "${IMAGE_NAMESPACE}-order-service:${IMAGE_TAG}" \
                  "${IMAGE_NAMESPACE}-frontend:${IMAGE_TAG}" \
                  "${IMAGE_NAMESPACE}-proxy:${IMAGE_TAG}"
                do
                  docker image inspect "$image" >/dev/null
                done
                # Start the selected images without rebuilding; preserve named data volumes.
                docker compose up -d --no-build --remove-orphans
              '''
            }
          }
        }
      }
    }

    // Check that the running proxy reports the intended image version and serves the catalog.
    stage('Smoke / Verify') {
      when {
        expression { env.CHECKED_OUT_BRANCH == 'main' }
      }
      steps {
        script {
          // Verify the same tag chosen by the Deploy stage.
          def rollbackBuild = params.ROLLBACK_BUILD.trim()
          def selectedTag = rollbackBuild ? rollbackBuild : env.BUILD_NUMBER
          withEnv(["IMAGE_TAG=${selectedTag}"]) {
            withCredentials([
              string(credentialsId: 'ecommerce-db-password', variable: 'COMPOSE_DB_PASSWORD'),
              string(credentialsId: 'ecommerce-mysql-root-password', variable: 'MYSQL_ROOT_PASSWORD'),
              string(credentialsId: 'ecommerce-jwt-secret', variable: 'JWT_SECRET')
            ]) {
              sh '''
                set -eu
                deployed_version="$(curl --fail --silent --show-error --retry 30 --retry-delay 2 --retry-connrefused --retry-all-errors "http://host.docker.internal:${PROXY_PORT}/version")"
                # Fail this stage if the deployed proxy is not running the selected tag.
                test "$deployed_version" = "$IMAGE_TAG"
                # Confirm a real public API route responds through the deployed proxy.
                curl --fail --silent --show-error --retry 30 --retry-delay 2 --retry-connrefused --retry-all-errors "http://host.docker.internal:${PROXY_PORT}/api/products" >/dev/null
                # Print container state in Jenkins logs for troubleshooting and evidence.
                docker compose ps
              '''
            }
          }
        }
      }
    }
  }
}
