pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timestamps()
  }

  triggers {
    pollSCM('H/5 * * * *')
  }

  parameters {
    string(
      name: 'ROLLBACK_BUILD',
      defaultValue: '',
      description: 'Optional earlier successful numeric build number to redeploy; leave empty for this build.'
    )
  }

  environment {
    COMPOSE_PROJECT_NAME = 'ecommerce-app'
    COMPOSE_DB_USER = 'app_user'
    IMAGE_NAMESPACE = 'ecomapp'
    IMAGE_TAG = "${BUILD_NUMBER}"
    PROXY_PORT = '8080'
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          def scmState = checkout scm
          def sourceBranch = scmState.GIT_BRANCH ?: env.BRANCH_NAME
          if (!sourceBranch) {
            error('Could not determine the checked-out branch; refusing to deploy.')
          }
          env.CHECKED_OUT_BRANCH = sourceBranch.replaceFirst('^(origin/|refs/heads/)', '')
        }
      }
    }

    stage('Test') {
      steps {
        script {
          def rollbackBuild = params.ROLLBACK_BUILD.trim()
          if (rollbackBuild && !(rollbackBuild ==~ /^[0-9]+$/)) {
            error('ROLLBACK_BUILD must be a numeric successful Jenkins build number.')
          }
        }
        sh 'npm ci'
        sh 'npm ci --prefix services/auth-service'
        sh 'npm ci --prefix services/catalog-service'
        sh 'npm ci --prefix services/order-service'
        sh 'npm ci --prefix frontend'
        sh 'npm run test:ci'
      }
    }

    stage('Image Build') {
      when {
        expression { params.ROLLBACK_BUILD.trim().isEmpty() }
      }
      steps {
        withCredentials([
          string(credentialsId: 'ecommerce-db-password', variable: 'COMPOSE_DB_PASSWORD'),
          string(credentialsId: 'ecommerce-mysql-root-password', variable: 'MYSQL_ROOT_PASSWORD'),
          string(credentialsId: 'ecommerce-jwt-secret', variable: 'JWT_SECRET')
        ]) {
          sh 'docker compose build --pull'
        }
      }
    }

    stage('Deploy') {
      when {
        expression { env.CHECKED_OUT_BRANCH == 'main' }
      }
      steps {
        script {
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
                docker compose up -d --no-build --remove-orphans
              '''
            }
          }
        }
      }
    }

    stage('Smoke / Verify') {
      when {
        expression { env.CHECKED_OUT_BRANCH == 'main' }
      }
      steps {
        script {
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
                test "$deployed_version" = "$IMAGE_TAG"
                curl --fail --silent --show-error --retry 30 --retry-delay 2 --retry-connrefused --retry-all-errors "http://host.docker.internal:${PROXY_PORT}/api/products" >/dev/null
                docker compose ps
              '''
            }
          }
        }
      }
    }
  }
}
