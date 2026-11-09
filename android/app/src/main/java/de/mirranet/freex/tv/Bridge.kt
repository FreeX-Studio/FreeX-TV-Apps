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

package de.mirranet.freex.tv

import android.media.MediaCodecList
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.AudioCapabilities
import org.json.JSONArray
import org.json.JSONObject

/**
 * `window.FreeXNative` in the page. JavaScript calls these methods on a background thread; the
 * player is driven on the main thread.
 */
class Bridge(private val activity: MainActivity, private val player: NativePlayer) {

    @JavascriptInterface
    fun open(json: String) = activity.runOnUiThread { player.open(json) }

    @JavascriptInterface
    fun play() = activity.runOnUiThread { player.play() }

    @JavascriptInterface
    fun pause() = activity.runOnUiThread { player.pause() }

    @JavascriptInterface
    fun seek(ms: Double) = activity.runOnUiThread { player.seek(ms.toLong()) }

    @JavascriptInterface
    fun stop() = activity.runOnUiThread { player.stop() }

    @JavascriptInterface
    fun exit() = activity.runOnUiThread { activity.finish() }

    /** The name the user gave the device (Fire TV: "Niklas's Fire TV"), otherwise the model. */
    @JavascriptInterface
    fun deviceName(): String {
        val named = try {
            Settings.Global.getString(activity.contentResolver, "device_name")
        } catch (e: Exception) {
            null
        }
        if (!named.isNullOrBlank()) return named
        val maker = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        return if (Build.MODEL.startsWith(maker, ignoreCase = true)) Build.MODEL else "$maker ${Build.MODEL}"
    }

    /** What ExoPlayer can play on this device, as the server's playback decision expects it. */
    @JavascriptInterface
    fun capabilities(): String = capabilities.toString()

    private val capabilities: JSONObject by lazy { probe() }

    @OptIn(UnstableApi::class)
    private fun probe(): JSONObject {
        val types = HashSet<String>()
        for (info in MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos) {
            if (info.isEncoder) continue
            info.supportedTypes.forEach { types.add(it.lowercase()) }
        }
        val video = linkedSetOf("h264")
        mapOf(
            "video/hevc" to "hevc", "video/x-vnd.on2.vp9" to "vp9", "video/av01" to "av1",
            "video/mpeg2" to "mpeg2video", "video/mp4v-es" to "mpeg4", "video/x-vnd.on2.vp8" to "vp8",
        ).forEach { (mime, name) -> if (mime in types) video.add(name) }

        val audio = linkedSetOf("aac", "mp3")
        mapOf(
            "audio/ac3" to "ac3", "audio/eac3" to "eac3", "audio/opus" to "opus", "audio/flac" to "flac",
            "audio/vorbis" to "vorbis", "audio/vnd.dts" to "dts", "audio/true-hd" to "truehd",
        ).forEach { (mime, name) -> if (mime in types) audio.add(name) }
        // Sound the TV or receiver decodes itself (HDMI passthrough).
        @Suppress("DEPRECATION")
        val passthrough = AudioCapabilities.getCapabilities(activity)
        if (passthrough.supportsEncoding(C.ENCODING_AC3)) audio.add("ac3")
        if (passthrough.supportsEncoding(C.ENCODING_E_AC3)) audio.add("eac3")
        if (passthrough.supportsEncoding(C.ENCODING_DTS)) audio.add("dts")
        if (passthrough.supportsEncoding(C.ENCODING_DOLBY_TRUEHD)) audio.add("truehd")
        audio.addAll(listOf("pcm_s16le", "pcm_s24le"))

        val hlsVideo = video.filter { it == "h264" || it == "hevc" || it == "av1" }
        val hlsAudio = audio.filter { it in setOf("aac", "mp3", "ac3", "eac3", "flac", "opus") }
        return JSONObject()
            .put("containers", JSONArray(listOf("mp4", "mkv", "webm", "mpegts", "ts", "avi", "mov", "flv", "ogg")))
            .put("video", JSONArray(video.toList()))
            .put("audio", JSONArray(audio.toList()))
            .put("mseVideo", JSONArray(hlsVideo))
            .put("mseAudio", JSONArray(hlsAudio))
    }
}
