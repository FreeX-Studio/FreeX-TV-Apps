/*
 * Copyright (c) 2026 MirraNET, Niklas Linz. All rights reserved.
 *
 * This file is part of the MirraNET project and is licensed under the
 * GNU Lesser General Public License v3.0 (LGPLv3).
 *
 * You may use, distribute and modify this code under the terms
 * of the LGPLv3 license. You should have received a copy of the
 * license along with this file. If not, see <https://www.gnu.org/licenses/lgpl-3.0.html>
 * or contact: niklas.linz@mirranet.de
 */

// FreeX TV: the Android TV / Fire TV APK and the Samsung (Tizen) project.
//
// The build agent needs JDK 17, the Android SDK (ANDROID_HOME, platform 35 and build tools; the
// Gradle wrapper fetches everything else) and zip. With the Tizen CLI (tizen in PATH or
// ~/tizen-studio) and a certificate profile named in TIZEN_PROFILE it also signs FreeX.wgt.
// A release keystore for the APK comes from the environment (FREEX_KEYSTORE,
// FREEX_KEYSTORE_PASSWORD, FREEX_KEY_ALIAS, FREEX_KEY_PASSWORD); without it the debug key signs.

pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
        stage('Android') {
            steps {
                dir('android') {
                    sh './gradlew --no-daemon assembleRelease'
                }
                sh '''
                    VERSION=$(sed -n 's/.*"version": *"\\([^"]*\\)".*/\\1/p' web/version.json)
                    mkdir -p dist
                    cp android/app/build/outputs/apk/release/app-release.apk "dist/FreeX-TV-Android-$VERSION.apk"
                '''
            }
        }

        stage('Tizen') {
            steps {
                sh '''
                    tizen/build.sh
                    cp build/FreeX-TV-Tizen-*.zip dist/
                    if ls build/*.wgt >/dev/null 2>&1; then cp build/*.wgt dist/; fi
                '''
            }
        }
    }

    post {
        success {
            archiveArtifacts artifacts: 'dist/*', fingerprint: true
        }
    }
}
