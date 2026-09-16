pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out Chai Analysis Application...'
                checkout scm
            }
        }

        stage('Project Check') {
            steps {
                echo 'Checking project structure...'
                sh 'python3 --version || true'
                sh 'node --version || true'
                sh 'npm --version || true'
                sh 'docker --version || true'
                sh 'docker compose version || true'
            }
        }

        stage('Docker Compose Validation') {
            steps {
                echo 'Validating Docker Compose configuration...'
                sh 'docker compose config'
            }
        }
    }

    post {
        success {
            echo 'Chai Analysis CI Pipeline completed successfully!'
        }

        failure {
            echo 'Chai Analysis CI Pipeline failed. Check the console output.'
        }
    }
}
