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

import javax.inject.Inject

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** The shared TV client (../../web) becomes the app's assets under web/. */
abstract class CopyWebAssets : DefaultTask() {
    @get:InputDirectory
    abstract val source: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun copy() {
        fs.sync {
            from(source)
            into(outputDir.dir("web"))
            exclude("blank.html")
        }
    }
}

val copyWebAssets = tasks.register<CopyWebAssets>("copyWebAssets") {
    source.set(rootProject.file("../web"))
}

// Version of the app: the same as the web client (web/version.json).
val webVersion: String = groovy.json.JsonSlurper()
    .parse(rootProject.file("../web/version.json"))
    .let { (it as Map<*, *>)["version"] as String }
val versionParts = webVersion.split(".").map { it.toInt() }

/* Release signing: with a keystore from the environment (CI secrets), otherwise the debug key, so
   every APK can be installed (sideloading on Fire TV). */
val keystore: String? = System.getenv("FREEX_KEYSTORE")

android {
    namespace = "de.mirranet.freex.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.mirranet.freex.tv"
        // Fire TV Stick (1st generation) runs Fire OS 5 = Android 5.1.
        minSdk = 22
        targetSdk = 34
        versionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]
        versionName = webVersion
    }

    signingConfigs {
        create("release") {
            if (keystore != null) {
                storeFile = file(keystore)
                storePassword = System.getenv("FREEX_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("FREEX_KEY_ALIAS")
                keyPassword = System.getenv("FREEX_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystore != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        // A TV app on purpose: no touch screen, landscape only.
        disable += setOf("MissingLeanbackSupport", "ImpliedTouchscreenHardware", "LockedOrientationActivity", "SetJavaScriptEnabled")
        abortOnError = false
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebAssets, CopyWebAssets::outputDir)
    }
}

dependencies {
    val media3 = "1.5.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-ui:$media3")
    implementation("androidx.webkit:webkit:1.12.1")
}
